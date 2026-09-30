/** AP Baseball Fall Ball umpire pay sheet dated 7/30/2026. Not LLB or DYB. */

export type FallBallPayBand =
  | "tee"
  | "coach"
  | "nineTwelve"
  | "thirteenFourteen"
  | "fifteenSeventeen";

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

export function fallBallAssignmentPay(input: {
  ageGroup: string;
  umpiresOnGame: number;
  gamesThatNight: number;
  cancelled?: boolean;
}): number {
  if (input.cancelled) return 0;
  const band = fallBallPayBand(input.ageGroup);
  if (!band || band === "tee") return 0;
  const onlyOneGame = input.gamesThatNight <= 1;
  if (band === "coach") return onlyOneGame ? 60 : 40;
  if (band === "nineTwelve") return onlyOneGame ? 80 : 60;
  if (band === "thirteenFourteen") return 80;
  return input.umpiresOnGame === 1 ? 80 : 60;
}
