import { z } from "zod";

import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import {
  defaultOfficialTemplateForNewProject,
  specDefaultsFromOfficialTemplate,
} from "@/lib/tournament-brackets/officialTemplates";

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

/** Official LL bracket header block (Division, Site(s), etc.) shown in the classic diagram inset. */
export const bracketTournamentInfoSchema = z.object({
  division: z.string().max(200).optional(),
  sites: z.string().max(500).optional(),
  updatePhone: z.string().max(80).optional(),
  tournamentDirector: z.string().max(120).optional(),
  nextLevel: z.string().max(200).optional(),
});

/** Pixel-level visual alignment overrides for classic bracket diagrams. */
export const bracketVisualOffsetSchema = z.object({
  xPx: z.number().min(-96).max(96).optional(),
  yPx: z.number().min(-96).max(96).optional(),
});

export const bracketVisualTuningSchema = z.object({
  /** @deprecated Use connectors.{g8-champion|g10-champion}.yPx. Kept for saved specs from the first tuning pass. */
  championConnectorYOffsetPx: z.number().min(-24).max(24).optional(),
  games: z.record(z.string(), bracketVisualOffsetSchema).optional(),
  connectors: z.record(z.string(), bracketVisualOffsetSchema).optional(),
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
  /** Championship series: grand final or if-necessary reset game. */
  championshipRole: z.enum(["grand_final", "if_necessary"]).optional(),
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
    championshipRole,
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
      championshipRole?: "grand_final" | "if_necessary";
    } = {
      id,
      home,
      away,
    };
    if (homeScore != null) out.homeScore = homeScore;
    if (awayScore != null) out.awayScore = awayScore;
    if (winnerSide) out.winnerSide = winnerSide;
    if (merged) out.officialGameNumber = merged;
    if (championshipRole) out.championshipRole = championshipRole;
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
  /** Double elimination: which bracket panel this round belongs to. */
  bracketSection: z.enum(["winners", "losers", "championship"]).optional(),
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
  /** Official tournament-legal template from the governing-body registry. */
  officialTemplateId: z.string().optional(),
  /** Prefer classic unified diagram vs connected column trees when both are possible. */
  layoutPreference: z.enum(["official", "connected_columns"]).default("official"),
  bracketFormat: z
    .enum([
      "double_elimination",
      "modified_double_elimination",
      "single_elimination",
      "pool_play",
      "custom",
      "unknown",
    ])
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
  /** Official LL tournament header table (classic unified diagram top-right inset). */
  tournamentInfo: bracketTournamentInfoSchema.optional(),
  /** DB-backed visual tuning, inherited by new brackets for the same site/year. */
  visualTuning: bracketVisualTuningSchema.optional(),
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
  /**
   * Double elimination championship scheduling style.
   * `always_scheduled_reset`: Grand Final + If-Necessary games are always listed on the bracket.
   * `winner_take_all`: Grand Final only (modified double elimination).
   */
  championshipSeriesStyle: z.enum(["always_scheduled_reset", "winner_take_all"]).optional(),
  /** Set when the tournament champion is decided (double elim championship). */
  championTeamName: z.string().max(120).optional(),
  /**
   * Classic unified double-elimination diagram (G1–G9, champion column) is frozen.
   * Only scores, team name labels, and schedule metadata may change.
   */
  classicDoubleElimLayoutLocked: z.boolean().optional(),
  /** Set when a governing-body PDF bracket was imported and wizard fields were pre-filled. */
  pdfIngestHints: z
    .object({
      templateId: z.string(),
      templateLabel: z.string(),
      teamCount: z.number().int().positive().optional(),
      artifactUrl: z.string().optional(),
      importedAt: z.string().optional(),
      roundsBuilt: z.boolean().optional(),
      gamesBuilt: z.number().int().nonnegative().optional(),
      scheduleLinesApplied: z.number().int().nonnegative().optional(),
      routingVerified: z.boolean().optional(),
    })
    .optional(),
});

export type BracketSpec = z.infer<typeof bracketSpecSchema>;
export type BracketGameRow = z.infer<typeof bracketGameRowSchema>;
export type BracketRound = z.infer<typeof bracketRoundSchema>;
export type BracketMatch = z.infer<typeof bracketMatchSchema>;
export type BracketThirdPlaceGame = z.infer<typeof bracketThirdPlaceGameSchema>;
export type FlyerOptions = z.infer<typeof flyerOptionsSchema>;
export type BracketParkInfo = z.infer<typeof bracketParkInfoSchema>;
export type BracketParkContact = z.infer<typeof bracketParkContactSchema>;
export type BracketTournamentInfo = z.infer<typeof bracketTournamentInfoSchema>;
export type BracketVisualTuning = z.infer<typeof bracketVisualTuningSchema>;

export function defaultBracketSpec(): BracketSpec {
  const template = defaultOfficialTemplateForNewProject();
  return bracketSpecSchema.parse(specDefaultsFromOfficialTemplate(template.id));
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
  if (Object.prototype.hasOwnProperty.call(partial, "tournamentInfo")) {
    if (partial.tournamentInfo == null || typeof partial.tournamentInfo !== "object") {
      delete next.tournamentInfo;
    } else {
      const merged = { ...(current.tournamentInfo ?? {}), ...(partial.tournamentInfo as object) } as Record<
        string,
        unknown
      >;
      const cleaned: BracketTournamentInfo = {};
      for (const key of [
        "division",
        "sites",
        "updatePhone",
        "tournamentDirector",
        "nextLevel",
      ] as const) {
        const v = merged[key];
        if (typeof v === "string" && v.trim()) cleaned[key] = v.trim();
      }
      if (Object.keys(cleaned).length === 0) {
        delete next.tournamentInfo;
      } else {
        next.tournamentInfo = cleaned;
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(partial, "visualTuning")) {
    if (partial.visualTuning == null || typeof partial.visualTuning !== "object") {
      delete next.visualTuning;
    } else {
      const parsed = bracketVisualTuningSchema.safeParse({
        ...(current.visualTuning ?? {}),
        ...(partial.visualTuning as Record<string, unknown>),
      });
      if (!parsed.success) {
        const issues = formatBracketSpecZodIssues(parsed.error);
        throw new Error(`Visual tuning invalid: ${issues}`);
      }
      if (Object.keys(parsed.data).length === 0) {
        delete next.visualTuning;
      } else {
        next.visualTuning = parsed.data;
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
    "championTeamName",
    "rosterAgeGroup",
    "divisionLabel",
    "officialTemplateId",
    "governingBody",
    "layoutPreference",
    "championshipSeriesStyle",
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
  if (Object.prototype.hasOwnProperty.call(partial, "classicDoubleElimLayoutLocked")) {
    const v = partial.classicDoubleElimLayoutLocked;
    if (v === null || v === undefined || v === false) {
      delete (next as Record<string, unknown>)["classicDoubleElimLayoutLocked"];
    } else {
      (next as Record<string, unknown>).classicDoubleElimLayoutLocked = true;
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
    if (partial.gameChanger == null) {
      delete next.gameChanger;
    } else if (typeof partial.gameChanger === "object") {
      const currentGc = bracketGameChangerSchema.safeParse(current.gameChanger);
      const mergedGc = bracketGameChangerSchema.safeParse({
        ...(currentGc.success ? currentGc.data : {}),
        ...(partial.gameChanger as Record<string, unknown>),
      });
      if (!mergedGc.success) {
        const issues = formatBracketSpecZodIssues(mergedGc.error);
        throw new Error(`GameChanger config invalid: ${issues}`);
      }
      next.gameChanger = mergedGc.data;
    }
  }
  if (Object.prototype.hasOwnProperty.call(partial, "pdfIngestHints")) {
    if (partial.pdfIngestHints == null) {
      delete (next as Record<string, unknown>).pdfIngestHints;
    } else if (typeof partial.pdfIngestHints === "object") {
      (next as Record<string, unknown>).pdfIngestHints = partial.pdfIngestHints;
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
