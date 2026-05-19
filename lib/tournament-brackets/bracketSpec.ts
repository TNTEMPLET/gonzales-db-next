import { z } from "zod";

import { bracketGameChangerSchema } from "@/lib/gamechanger/types";

export const bracketSpecVersion = 1 as const;

export const sponsorEntrySchema = z.object({
  label: z.string(),
  imageDataUrl: z.string().optional(),
});

export const flyerOptionsSchema = z.object({
  includeSponsors: z.boolean().default(false),
  sponsorLayout: z.enum(["footer", "sidebar", "none"]).default("none"),
  sponsorStrip: z.array(sponsorEntrySchema).default([]),
  logoUrl: z.string().optional(),
  primaryHex: z.string().optional(),
  accentHex: z.string().optional(),
});

/** One park / tournament point of contact (name + phone). */
export const bracketParkContactSchema = z.object({
  name: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
});

/** Optional park / venue copy shown on the bracket (below the title). */
export const bracketParkInfoSchema = z.object({
  heading: z.string().max(120).optional(),
  body: z.string().max(4000).optional(),
  /** Up to four contacts; admin UI currently edits the first two slots. */
  contacts: z.array(bracketParkContactSchema).max(4).optional(),
});

const bracketScoreSchema = z.number().int().min(0).max(99);

const bracketMatchInputSchema = z.object({
  id: z.string(),
  home: z.string(),
  away: z.string(),
  homeScore: bracketScoreSchema.optional(),
  awayScore: bracketScoreSchema.optional(),
  winnerSide: z.enum(["home", "away"]).optional(),
  /** Optional published/schedule game number (e.g. "2", "37") for `G…` / `W…` display labels when set. */
  officialGameNumber: z.string().max(32).optional(),
  /** @deprecated Prefer `officialGameNumber`. Kept for backwards compatibility with saved specs. */
  llOfficialGameNumber: z.string().max(32).optional(),
  /** Optional schedule / location lines on the bracket game card (preview + HTML export). */
  dateLabel: z.string().max(80).optional(),
  time: z.string().max(80).optional(),
  venue: z.string().max(160).optional(),
  field: z.string().max(160).optional(),
});

export const bracketMatchSchema = bracketMatchInputSchema.transform(
  ({
    id,
    home,
    away,
    homeScore,
    awayScore,
    winnerSide,
    officialGameNumber,
    llOfficialGameNumber,
    dateLabel,
    time,
    venue,
    field,
  }) => {
    const o = officialGameNumber?.trim() ?? "";
    const legacy = llOfficialGameNumber?.trim() ?? "";
    const merged = o || legacy;
    const out: {
      id: string;
      home: string;
      away: string;
      homeScore?: number;
      awayScore?: number;
      winnerSide?: "home" | "away";
      officialGameNumber?: string;
      dateLabel?: string;
      time?: string;
      venue?: string;
      field?: string;
    } = {
      id,
      home,
      away,
    };
    if (homeScore != null) out.homeScore = homeScore;
    if (awayScore != null) out.awayScore = awayScore;
    if (winnerSide) out.winnerSide = winnerSide;
    if (merged) out.officialGameNumber = merged;
    const d = dateLabel?.trim();
    if (d) out.dateLabel = d;
    const t = time?.trim();
    if (t) out.time = t;
    const v = venue?.trim();
    if (v) out.venue = v;
    const f = field?.trim();
    if (f) out.field = f;
    return out;
  },
);

export const bracketThirdPlaceGameSchema = z.object({
  home: z.string(),
  away: z.string(),
  /** Optional published/schedule game number for the third-place game. */
  officialGameNumber: z.string().max(32).optional(),
  /** Optional schedule / location lines shown on the bracket game card. */
  dateLabel: z.string().max(80).optional(),
  time: z.string().max(80).optional(),
  venue: z.string().max(160).optional(),
  field: z.string().max(160).optional(),
  homeScore: bracketScoreSchema.optional(),
  awayScore: bracketScoreSchema.optional(),
  winnerSide: z.enum(["home", "away"]).optional(),
});

export const bracketRoundSchema = z.object({
  id: z.string(),
  label: z.string(),
  matches: z.array(bracketMatchSchema).default([]),
});

export const bracketGameRowSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  dateLabel: z.string().optional(),
  time: z.string().optional(),
  venue: z.string().optional(),
  field: z.string().optional(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  tournament: z.string().optional(),
  gameNumber: z.string().optional(),
});

export const bracketSpecSchema = z.object({
  version: z.literal(1).default(1),
  divisionLabel: z.string().optional(),
  governingBody: z.string().optional(),
  bracketFormat: z
    .enum(["double_elimination", "single_elimination", "pool_play", "custom", "unknown"])
    .default("unknown"),
  teams: z.array(z.string()).default([]),
  rounds: z.array(bracketRoundSchema).default([]),
  games: z.array(bracketGameRowSchema).default([]),
  flyer: flyerOptionsSchema.default({
    includeSponsors: false,
    sponsorLayout: "none",
    sponsorStrip: [],
  }),
  /** Shown on bracket preview + HTML export (e.g. complex address, parking gates). */
  parkInfo: bracketParkInfoSchema.optional(),
  ingestionWarnings: z.array(z.string()).default([]),
  referenceUrl: z.string().optional(),
  fetchedReferenceExcerpt: z.string().optional(),
  /** After guided setup finishes, admin shows Bracket structure + preview. Also set when skipping the questionnaire. */
  setupWizardCompleted: z.boolean().optional(),
  /** Optional override for LLBWS-style bracket preview/export (defaults to target site primary). */
  bracketThemePrimaryHex: z.string().optional(),
  /** Optional override for LLBWS-style bracket preview/export (defaults to target site accent). */
  bracketThemeAccentHex: z.string().optional(),
  /** Single elimination only: show optional 3rd-place game (semi losers) + podium column. */
  singleElimIncludeThirdPlace: z.boolean().optional(),
  /**
   * Shown as “{label} Champion” on the podium (e.g. `12U`). Falls back to `divisionLabel` when unset.
   * Collected in guided setup; editable in admin.
   */
  championAgeGroupLabel: z.string().max(120).optional(),
  /** League roster age group used when picking teams in admin (Teams table). */
  rosterAgeGroup: z.string().max(48).optional(),
  /** Filled when semifinal scores are saved (single elim + 3rd place). */
  thirdPlaceGame: bracketThirdPlaceGameSchema.optional(),
  /** GameChanger tournament scoreboard widget (Tools → Create Scoreboard on web.gc.com). */
  gameChanger: bracketGameChangerSchema.optional(),
});

export type BracketSpec = z.infer<typeof bracketSpecSchema>;
export type BracketGameRow = z.infer<typeof bracketGameRowSchema>;
export type BracketRound = z.infer<typeof bracketRoundSchema>;
export type BracketMatch = z.infer<typeof bracketMatchSchema>;
export type BracketThirdPlaceGame = z.infer<typeof bracketThirdPlaceGameSchema>;
export type FlyerOptions = z.infer<typeof flyerOptionsSchema>;
export type BracketParkInfo = z.infer<typeof bracketParkInfoSchema>;
export type BracketParkContact = z.infer<typeof bracketParkContactSchema>;
export function defaultBracketSpec(): BracketSpec {
  return bracketSpecSchema.parse({});
}

/** Prefix for grep-friendly server / browser logs when troubleshooting corrupt specs. */
export const BRACKET_SPEC_LOG_PREFIX = "[bracket-spec]" as const;

export function formatBracketSpecZodIssues(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`).join("; ");
}

function logBracketSpecIssue(where: string, detail: string): void {
  console.warn(`${BRACKET_SPEC_LOG_PREFIX} ${where}: ${detail}`);
}

export type SafeParseBracketSpecResult =
  | { ok: true; spec: BracketSpec }
  | { ok: false; spec: BracketSpec; issues: string };

/**
 * Like {@link parseBracketSpec} but surfaces validation errors for UI / logs.
 * On failure returns {@link defaultBracketSpec} plus `issues` and logs a warning.
 */
export function safeParseBracketSpec(raw: unknown): SafeParseBracketSpecResult {
  const parsed = bracketSpecSchema.safeParse(raw);
  if (parsed.success) return { ok: true, spec: parsed.data };
  const issues = formatBracketSpecZodIssues(parsed.error);
  logBracketSpecIssue("parse failed (stored document rejected by schema)", issues);
  return { ok: false, spec: defaultBracketSpec(), issues };
}

export function parseBracketSpec(raw: unknown): BracketSpec {
  return safeParseBracketSpec(raw).spec;
}

/** True when the spec already has schedule/grid content (projects created before the guided gate). */
export function hasBracketContentForLegacyUnlock(spec: BracketSpec): boolean {
  if (spec.games.length > 0) return true;
  return spec.rounds.some((r) => r.matches.length > 0);
}

/**
 * Bracket structure + preview are shown only after guided setup is finished, or when legacy content exists.
 */
export function isBracketSetupWizardComplete(spec: BracketSpec): boolean {
  return spec.setupWizardCompleted === true || hasBracketContentForLegacyUnlock(spec);
}

/** Shallow-deep merge for assistant/tool partial updates. */
export function mergeBracketSpec(
  current: BracketSpec,
  partial: Record<string, unknown>,
): BracketSpec {
  const next: Record<string, unknown> = { ...current, ...partial };
  if (partial.flyer && typeof partial.flyer === "object") {
    next.flyer = { ...current.flyer, ...(partial.flyer as object) };
  }
  if (Object.prototype.hasOwnProperty.call(partial, "parkInfo")) {
    if (partial.parkInfo == null || typeof partial.parkInfo !== "object") {
      delete next.parkInfo;
    } else {
      const merged = { ...(current.parkInfo ?? {}), ...(partial.parkInfo as object) } as {
        heading?: unknown;
        body?: unknown;
        contacts?: unknown;
      };
      const heading = typeof merged.heading === "string" ? merged.heading.trim() : "";
      const body = typeof merged.body === "string" ? merged.body.trim() : "";
      const contacts: { name?: string; phone?: string }[] = [];
      if (Array.isArray(merged.contacts)) {
        for (const c of merged.contacts) {
          if (contacts.length >= 4) break;
          if (!c || typeof c !== "object") continue;
          const o = c as Record<string, unknown>;
          const n = typeof o.name === "string" ? o.name.trim() : "";
          const p = typeof o.phone === "string" ? o.phone.trim() : "";
          if (!n && !p) continue;
          const entry: { name?: string; phone?: string } = {};
          if (n) entry.name = n;
          if (p) entry.phone = p;
          contacts.push(entry);
        }
      }
      if (!heading && !body && contacts.length === 0) {
        delete next.parkInfo;
      } else {
        next.parkInfo = {
          ...(heading ? { heading } : {}),
          ...(body ? { body } : {}),
          ...(contacts.length > 0 ? { contacts } : {}),
        };
      }
    }
  }
  if (Array.isArray(partial.games)) {
    next.games = partial.games;
  }
  if (Array.isArray(partial.teams)) {
    next.teams = partial.teams;
  }
  if (Array.isArray(partial.rounds)) {
    next.rounds = partial.rounds;
  }
  if (Array.isArray(partial.ingestionWarnings)) {
    next.ingestionWarnings = partial.ingestionWarnings;
  }
  for (const key of [
    "bracketThemePrimaryHex",
    "bracketThemeAccentHex",
    "championAgeGroupLabel",
    "rosterAgeGroup",
    "divisionLabel",
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(partial, key)) continue;
    const v = partial[key];
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
      delete (next as Record<string, unknown>)[key];
    } else if (typeof v === "string") {
      (next as Record<string, unknown>)[key] = v.trim();
    }
  }
  if (Object.prototype.hasOwnProperty.call(partial, "singleElimIncludeThirdPlace")) {
    const v = partial.singleElimIncludeThirdPlace;
    if (v === null || v === undefined) {
      delete (next as Record<string, unknown>)["singleElimIncludeThirdPlace"];
    } else {
      (next as Record<string, unknown>).singleElimIncludeThirdPlace = Boolean(v);
    }
  }
  if (Object.prototype.hasOwnProperty.call(partial, "thirdPlaceGame")) {
    if (partial.thirdPlaceGame == null || typeof partial.thirdPlaceGame !== "object") {
      delete next.thirdPlaceGame;
    } else {
      next.thirdPlaceGame = partial.thirdPlaceGame;
    }
  }
  if (Object.prototype.hasOwnProperty.call(partial, "gameChanger")) {
    if (partial.gameChanger == null || typeof partial.gameChanger !== "object") {
      delete next.gameChanger;
    } else {
      const gc = partial.gameChanger as Record<string, unknown>;
      const widgetId = typeof gc.widgetId === "string" ? gc.widgetId.trim() : "";
      if (!widgetId) {
        delete next.gameChanger;
      } else {
        const mergedGc: Record<string, unknown> = { widgetId };
        if (typeof gc.maxVerticalGamesVisible === "number") {
          mergedGc.maxVerticalGamesVisible = gc.maxVerticalGamesVisible;
        }
        if (gc.layout === "vertical" || gc.layout === "horizontal") {
          mergedGc.layout = gc.layout;
        }
        next.gameChanger = mergedGc;
      }
    }
  }
  const mergedParse = bracketSpecSchema.safeParse(next);
  if (!mergedParse.success) {
    const issues = formatBracketSpecZodIssues(mergedParse.error);
    logBracketSpecIssue("mergeBracketSpec: merged document invalid after patch", issues);
    throw new Error(`Bracket save rejected: ${issues}`);
  }
  return mergedParse.data;
}
