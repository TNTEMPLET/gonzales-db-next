/** AP Baseball Fall Ball umpire pay sheet dated 7/30/2026. Not LLB or DYB. */

export type FallBallPayBand =
  | "tee"
  | "coach"
  | "nineTwelve"
  | "thirteenFourteen"
  | "fifteenSeventeen";

export const FALL_BALL_PAY_BAND_IDS: FallBallPayBand[] = [
  "tee",
  "coach",
  "nineTwelve",
  "thirteenFourteen",
  "fifteenSeventeen",
];

export type FallBallPayBandRow = {
  id: FallBallPayBand;
  label: string;
  basePay: number;
  umpiresNote: string;
  /** Higher pay if that umpire has only one game that night. */
  oneGameNightPay: number | null;
  /** Higher pay if only one umpire is on the game. */
  oneUmpirePay: number | null;
};

export type FallBallPaySchedule = {
  version: 1;
  bands: FallBallPayBandRow[];
};

export const DEFAULT_FALL_BALL_PAY_SCHEDULE: FallBallPaySchedule = {
  version: 1,
  bands: [
    {
      id: "tee",
      label: "Tee Ball (3-6U)",
      basePay: 0,
      umpiresNote: "n/a",
      oneGameNightPay: null,
      oneUmpirePay: null,
    },
    {
      id: "coach",
      label: "6-8U (Coach Pitch)",
      basePay: 40,
      umpiresNote: "1 or 2",
      oneGameNightPay: 60,
      oneUmpirePay: null,
    },
    {
      id: "nineTwelve",
      label: "9-12U",
      basePay: 60,
      umpiresNote: "1 or 2",
      oneGameNightPay: 80,
      oneUmpirePay: null,
    },
    {
      id: "thirteenFourteen",
      label: "13-14U",
      basePay: 80,
      umpiresNote: "1",
      oneGameNightPay: null,
      oneUmpirePay: null,
    },
    {
      id: "fifteenSeventeen",
      label: "15-17U",
      basePay: 60,
      umpiresNote: "2",
      oneGameNightPay: null,
      oneUmpirePay: 80,
    },
  ],
};

export function isFallBallOrg(org?: string | null): boolean {
  return org === "fallball";
}

function normalize(ageGroup: string): string {
  return ageGroup.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Fall Ball 15U is 13–15 year-olds (13-14U on the sheet).
 * Fall Ball 17U is 15–17 year-olds.
 */
export function fallBallPayBand(ageGroup: string): FallBallPayBand | null {
  const n = normalize(ageGroup);
  if (
    /\bTB\b/.test(n) ||
    n.includes("TEE BALL") ||
    n.includes("TEEBALL") ||
    /\bMOD\b/.test(n) ||
    n.includes("MODIFIED")
  ) {
    return "tee";
  }
  if (/\b13\s*[-–]\s*14\b/.test(n) || /\b13\s*[-–]\s*15\b/.test(n)) {
    return "thirteenFourteen";
  }
  if (/\b15\s*[-–]\s*17\b/.test(n)) {
    return "fifteenSeventeen";
  }
  const match = n.match(/\b(\d{1,2})\s*U\b/);
  if (!match?.[1]) return null;
  const age = Number.parseInt(match[1], 10);
  if (age <= 5) return "tee";
  if (age >= 6 && age <= 8) return "coach";
  if (age >= 9 && age <= 12) return "nineTwelve";
  if (age >= 13 && age <= 15) return "thirteenFourteen";
  if (age >= 16 && age <= 18) return "fifteenSeventeen";
  return null;
}

function isPayBand(value: string): value is FallBallPayBand {
  return (FALL_BALL_PAY_BAND_IDS as string[]).includes(value);
}

function asMoney(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 500) return fallback;
  return Math.round(n);
}

function asOptionalMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 500) return null;
  return Math.round(n);
}

export function parseFallBallPaySchedule(raw: unknown): FallBallPaySchedule {
  const incoming =
    raw && typeof raw === "object" && Array.isArray((raw as { bands?: unknown }).bands)
      ? ((raw as { bands: unknown[] }).bands)
      : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of incoming) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: unknown }).id ?? "");
    if (isPayBand(id)) byId.set(id, row as Record<string, unknown>);
  }
  return {
    version: 1,
    bands: DEFAULT_FALL_BALL_PAY_SCHEDULE.bands.map((fallback) => {
      const stored = byId.get(fallback.id);
      if (!stored) return { ...fallback };
      return {
        id: fallback.id,
        label: fallback.label,
        umpiresNote: fallback.umpiresNote,
        basePay: asMoney(stored.basePay, fallback.basePay),
        oneGameNightPay:
          "oneGameNightPay" in stored ? asOptionalMoney(stored.oneGameNightPay) : fallback.oneGameNightPay,
        oneUmpirePay:
          fallback.id === "fifteenSeventeen"
            ? ("oneUmpirePay" in stored ? asOptionalMoney(stored.oneUmpirePay) : fallback.oneUmpirePay)
            : null,
      };
    }),
  };
}

export function bandRow(
  schedule: FallBallPaySchedule | null | undefined,
  id: FallBallPayBand,
): FallBallPayBandRow {
  const source = schedule ?? DEFAULT_FALL_BALL_PAY_SCHEDULE;
  return source.bands.find((row) => row.id === id) ?? DEFAULT_FALL_BALL_PAY_SCHEDULE.bands.find((row) => row.id === id)!;
}

export function fallBallAssignmentPay(input: {
  ageGroup: string;
  umpiresOnGame: number;
  gamesThatNight: number;
  cancelled?: boolean;
  schedule?: FallBallPaySchedule | null;
}): number {
  if (input.cancelled) return 0;
  const band = fallBallPayBand(input.ageGroup);
  if (!band) return 0;
  const row = bandRow(input.schedule, band);
  if (band === "tee") return 0;
  const onlyOneGame = input.gamesThatNight <= 1;
  if (row.oneGameNightPay != null && onlyOneGame) return row.oneGameNightPay;
  if (row.oneUmpirePay != null && input.umpiresOnGame === 1) return row.oneUmpirePay;
  return row.basePay;
}
