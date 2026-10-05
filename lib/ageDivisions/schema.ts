/**
 * Client-safe validation for division-age settings. Gaps and overlaps are
 * warnings from `coverageWarnings`, not errors here.
 */

import { z } from "zod";

import { effectiveCutoffDate, effectiveRange } from "./compute";
import type { DivisionAgeConfig, LeagueAgeRule } from "./types";

export const MAX_DIVISION_COUNT = 40;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function daysInMonth(month: number): number {
  if (month === 2) return 29;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function isRealCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12) return false;
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= max;
}

const ageField = z
  .number()
  .int("Enter a whole age.")
  .min(0, "Age must be between 0 and 25.")
  .max(25, "Age must be between 0 and 25.");

const rosterBound = z
  .number()
  .int("Roster size must be a whole number.")
  .min(1, "Roster size must be between 1 and 30.")
  .max(30, "Roster size must be between 1 and 30.");

const optionalIsoDate = z
  .string()
  .trim()
  .regex(ISO_DATE, "Use a YYYY-MM-DD birthdate.")
  .refine(isRealCalendarDate, "Enter a real calendar date.")
  .optional();

export const cutoffSchema = z
  .object({
    cutoffMonth: z.number().int().min(1, "Month must be from 1 to 12.").max(12, "Month must be from 1 to 12."),
    cutoffDay: z.number().int().min(1, "Day must be at least 1.").max(31, "Day must be at most 31."),
    yearOffset: z
      .number()
      .int("Year offset must be a whole number.")
      .min(-1, "Year offset must be between -1 and 2.")
      .max(2, "Year offset must be between -1 and 2."),
  })
  .superRefine((value, ctx) => {
    const maxDay = daysInMonth(value.cutoffMonth);
    if (value.cutoffDay > maxDay) {
      ctx.addIssue({
        code: "custom",
        path: ["cutoffDay"],
        message: `Day must be between 1 and ${maxDay} for that month.`,
      });
    }
  });

export const divisionAgeSchema = z
  .object({
    code: z.string().trim().min(1, "Enter a division code.").max(40, "Division code must be 40 characters or fewer."),
    label: z.string().trim().min(1, "Enter a division label.").max(80, "Division label must be 80 characters or fewer."),
    minAge: ageField,
    maxAge: ageField,
    sortOrder: z.number().int().min(-1000).max(10000),
    oldestBirthdate: optionalIsoDate,
    youngestBirthdate: optionalIsoDate,
    cutoffPreset: z.enum(["little-league", "dyb", "custom"]).optional(),
  })
  .superRefine((division, ctx) => {
    if (division.minAge > division.maxAge) {
      ctx.addIssue({
        code: "custom",
        path: ["minAge"],
        message: "Minimum age must be less than or equal to maximum age.",
      });
    }
  });

function uniqueDivisionCodes(divisions: { code: string }[], ctx: z.RefinementCtx) {
  const seen = new Map<string, number>();
  divisions.forEach((division, index) => {
    const previous = seen.get(division.code);
    if (previous != null) {
      ctx.addIssue({
        code: "custom",
        path: [index, "code"],
        message: "Division codes must be unique.",
      });
      return;
    }
    seen.set(division.code, index);
  });
}

const divisionListSchema = z
  .array(divisionAgeSchema)
  .max(MAX_DIVISION_COUNT, "Keep the list to 40 divisions or fewer.")
  .superRefine(uniqueDivisionCodes);

const leagueDivisionSchema = z
  .object({
    code: z.string().trim().min(1, "Enter a division code.").max(40, "Division code must be 40 characters or fewer."),
    label: z.string().trim().min(1, "Enter a division label.").max(80, "Division label must be 80 characters or fewer."),
    minAge: ageField,
    maxAge: ageField,
    sortOrder: z.number().int().min(-1000).max(10000),
    rosterMin: rosterBound.optional(),
    rosterMax: rosterBound.optional(),
  })
  .superRefine((division, ctx) => {
    if (division.minAge > division.maxAge) {
      ctx.addIssue({
        code: "custom",
        path: ["minAge"],
        message: "Minimum age must be less than or equal to maximum age.",
      });
    }
    const hasMin = division.rosterMin != null;
    const hasMax = division.rosterMax != null;
    if (hasMin !== hasMax) {
      ctx.addIssue({
        code: "custom",
        path: ["rosterMin"],
        message: "Enter both a minimum and a maximum roster size, or leave both blank.",
      });
    } else if (hasMin && hasMax && division.rosterMin! > division.rosterMax!) {
      ctx.addIssue({
        code: "custom",
        path: ["rosterMin"],
        message: "Roster minimum must be less than or equal to roster maximum.",
      });
    }
  });

const leagueDivisionListSchema = z
  .array(leagueDivisionSchema)
  .max(MAX_DIVISION_COUNT, "Keep the list to 40 divisions or fewer.")
  .superRefine(uniqueDivisionCodes);

/** Year-to-year return rate when a saved league row has no value. */
export const DEFAULT_RETURN_RATE_PERCENT = 100;

/** Ascension feeder share when a saved league row has no value. */
export const DEFAULT_FEEDER_SHARE_PERCENT = 10;

const percentField = z
  .number()
  .min(0, "Enter a percent from 0 to 100.")
  .max(100, "Enter a percent from 0 to 100.");

export const leagueDefaultsSchema = z
  .object({
    cutoffMonth: z.number().int().min(1, "Month must be from 1 to 12.").max(12, "Month must be from 1 to 12."),
    cutoffDay: z.number().int().min(1, "Day must be at least 1.").max(31, "Day must be at most 31."),
    yearOffset: z
      .number()
      .int("Year offset must be a whole number.")
      .min(-1, "Year offset must be between -1 and 2.")
      .max(2, "Year offset must be between -1 and 2."),
    divisions: leagueDivisionListSchema,
    returnRatePercent: percentField.optional(),
    feederSharePercent: percentField.optional(),
  })
  .superRefine((value, ctx) => {
    const maxDay = daysInMonth(value.cutoffMonth);
    if (value.cutoffDay > maxDay) {
      ctx.addIssue({
        code: "custom",
        path: ["cutoffDay"],
        message: `Day must be between 1 and ${maxDay} for that month.`,
      });
    }
  });

const auditSchema = z.object({
  confirmedAt: z.string().regex(ISO_INSTANT, "Confirmation time must be an ISO timestamp.").optional(),
  confirmedByAdminId: z.string().trim().min(1).max(80).optional(),
  updatedAt: z.string().regex(ISO_INSTANT, "Updated time must be an ISO timestamp.").optional(),
  updatedByAdminId: z.string().trim().min(1).max(80).optional(),
});

export const seasonDivisionAgesSchema = z
  .object({
    cutoff: cutoffSchema,
    divisions: divisionListSchema,
  })
  .and(auditSchema);

const seasonResetSchema = z.object({
  resetToLeagueDefaults: z.literal(true),
});

export const seasonDivisionAgesWriteSchema = z.object({
  cutoff: cutoffSchema,
  divisions: divisionListSchema,
  confirm: z.boolean().optional(),
});

export type LeagueDefaultsInput = {
  cutoffMonth: number;
  cutoffDay: number;
  yearOffset: number;
  divisions: DivisionAgeConfig[];
  /** 0–100. Missing on old rows means {@link DEFAULT_RETURN_RATE_PERCENT}. */
  returnRatePercent: number;
  /** 0–100. Missing on old rows means {@link DEFAULT_FEEDER_SHARE_PERCENT}. */
  feederSharePercent: number;
};

/**
 * One prior combined-save table, stored inside `divisionAgesJson`.
 * `{ absent: true }` means that league had no season row. A snapshot never
 * contains another `previous`, so undo keeps a single step.
 */
export type SeasonPrevious =
  | { absent: true }
  | {
      cutoff: LeagueAgeRule;
      divisions: DivisionAgeConfig[];
      confirmedAt?: string;
      confirmedByAdminId?: string;
      updatedAt?: string;
      updatedByAdminId?: string;
    };

export type SeasonDivisionAgesRecord = {
  cutoff: LeagueAgeRule;
  divisions: DivisionAgeConfig[];
  confirmedAt?: string;
  confirmedByAdminId?: string;
  updatedAt?: string;
  updatedByAdminId?: string;
  /** Set only by a combined Spring save. Per-league saves omit it. */
  previous?: SeasonPrevious;
};

export type DivisionAgesSource = "season" | "league" | "builtin";

export type SeasonDivisionAgesView = {
  source: DivisionAgesSource;
  storageReady: boolean;
  storageNote: string | null;
  cutoff: LeagueAgeRule;
  divisions: DivisionAgeConfig[];
  confirmedAt: string | null;
  confirmedByAdminId: string | null;
  updatedAt: string | null;
  updatedByAdminId: string | null;
  /** True when this season row still has the combined-save snapshot. */
  undoAvailable?: boolean;
  /** Hash of the stored season JSON, or "absent" when this season has no row. */
  baselineToken?: string;
};

export type LeagueDefaultsView = {
  source: "league" | "builtin";
  storageReady: boolean;
  storageNote: string | null;
  cutoffMonth: number;
  cutoffDay: number;
  yearOffset: number;
  divisions: DivisionAgeConfig[];
  returnRatePercent: number;
  feederSharePercent: number;
  updatedAt: string | null;
  updatedByAdminId: string | null;
};

export type UnpackedLeagueDivisions = {
  divisions: unknown;
  returnRatePercent?: number;
  feederSharePercent?: number;
  returnRateSource: "league" | "default";
  feederShareSource: "league" | "default";
};

function percentOrUndefined(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return undefined;
  return value;
}

/**
 * `divisionsJson` is either a legacy division array or
 * `{ divisions, returnRatePercent?, feederSharePercent? }`.
 * Missing percents stay unset so callers can default them.
 */
export function unpackLeagueDivisionsJson(raw: unknown): UnpackedLeagueDivisions {
  if (Array.isArray(raw)) {
    return { divisions: raw, returnRateSource: "default", feederShareSource: "default" };
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { divisions?: unknown }).divisions)) {
    const record = raw as {
      divisions: unknown;
      returnRatePercent?: unknown;
      feederSharePercent?: unknown;
    };
    const returnRatePercent = percentOrUndefined(record.returnRatePercent);
    const feederSharePercent = percentOrUndefined(record.feederSharePercent);
    return {
      divisions: record.divisions,
      returnRatePercent,
      feederSharePercent,
      returnRateSource: returnRatePercent == null ? "default" : "league",
      feederShareSource: feederSharePercent == null ? "default" : "league",
    };
  }
  return { divisions: raw, returnRateSource: "default", feederShareSource: "default" };
}

/** Shape written into `LeagueAgeDivisionDefaults.divisionsJson`. No new column. */
export function packLeagueDivisionsJson(input: LeagueDefaultsInput): {
  divisions: DivisionAgeConfig[];
  returnRatePercent: number;
  feederSharePercent: number;
} {
  return {
    divisions: input.divisions.map((division) => ({ ...division })),
    returnRatePercent: input.returnRatePercent,
    feederSharePercent: input.feederSharePercent,
  };
}

export type FieldIssue = { path: string; message: string };

function issueList(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

function failure(issues: FieldIssue[]): { ok: false; error: string; issues: string[] } {
  const lines = issues.map((issue) => `${issue.path}: ${issue.message}`);
  return { ok: false, error: lines[0] || "Invalid division ages.", issues: lines };
}

function rangeIssues(divisions: DivisionAgeConfig[], cutoff: LeagueAgeRule, seasonYear: number): FieldIssue[] {
  let cutoffIso = "";
  try {
    cutoffIso = effectiveCutoffDate(cutoff, seasonYear);
  } catch {
    return [];
  }
  const issues: FieldIssue[] = [];
  divisions.forEach((division, index) => {
    if (division.minAge > division.maxAge) return;
    const range = effectiveRange(division, cutoffIso);
    if (!range.oldest || !range.youngest || range.oldest > range.youngest) {
      issues.push({
        path: `divisions.${index}.oldestBirthdate`,
        message: "Oldest birthdate must be on or before the youngest birthdate.",
      });
    }
  });
  return issues;
}

const previousSnapshotSchema = z.union([
  z.object({ absent: z.literal(true) }),
  z
    .object({
      cutoff: cutoffSchema,
      divisions: divisionListSchema,
    })
    .and(auditSchema),
]);

/**
 * Read the one-step undo snapshot. A missing or unreadable snapshot is omitted
 * so an older season row still loads. Nested `previous` is not part of the schema.
 */
export function readPreviousSnapshot(value: unknown): SeasonPrevious | undefined {
  if (value == null) return undefined;
  const parsed = previousSnapshotSchema.safeParse(value);
  if (!parsed.success) return undefined;
  if ("absent" in parsed.data && parsed.data.absent === true) return { absent: true };
  if (!("cutoff" in parsed.data)) return undefined;
  const record = parsed.data;
  const divisions = numberDivisions(record.divisions);
  const snapshot: SeasonPrevious = {
    cutoff: record.cutoff,
    divisions,
  };
  if (record.confirmedAt) snapshot.confirmedAt = record.confirmedAt;
  if (record.confirmedByAdminId) snapshot.confirmedByAdminId = record.confirmedByAdminId;
  if (record.updatedAt) snapshot.updatedAt = record.updatedAt;
  if (record.updatedByAdminId) snapshot.updatedByAdminId = record.updatedByAdminId;
  return snapshot;
}

function attachPrevious(data: SeasonDivisionAgesRecord, input: unknown): SeasonDivisionAgesRecord {
  if (!input || typeof input !== "object" || !("previous" in input)) return data;
  const previous = readPreviousSnapshot((input as { previous?: unknown }).previous);
  if (!previous) return data;
  return { ...data, previous };
}

function numberDivisions(divisions: DivisionAgeConfig[]): DivisionAgeConfig[] {
  return divisions.map((division, index) => {
    const next: DivisionAgeConfig = {
      code: division.code,
      label: division.label,
      minAge: division.minAge,
      maxAge: division.maxAge,
      sortOrder: index + 1,
    };
    if (division.oldestBirthdate) next.oldestBirthdate = division.oldestBirthdate;
    if (division.youngestBirthdate) next.youngestBirthdate = division.youngestBirthdate;
    if (division.cutoffPreset) next.cutoffPreset = division.cutoffPreset;
    if (division.rosterMin != null) next.rosterMin = division.rosterMin;
    if (division.rosterMax != null) next.rosterMax = division.rosterMax;
    return next;
  });
}

/** Drop birthdates that match the calculated range so only real overrides are stored. */
export function withoutRedundantOverrides(
  divisions: DivisionAgeConfig[],
  cutoff: LeagueAgeRule,
  seasonYear: number,
): DivisionAgeConfig[] {
  const cutoffIso = effectiveCutoffDate(cutoff, seasonYear);
  return numberDivisions(divisions).map((division) => {
    const calculated = effectiveRange(
      { ...division, oldestBirthdate: undefined, youngestBirthdate: undefined },
      cutoffIso,
    );
    const next: DivisionAgeConfig = {
      code: division.code,
      label: division.label,
      minAge: division.minAge,
      maxAge: division.maxAge,
      sortOrder: division.sortOrder,
    };
    if (division.oldestBirthdate && division.oldestBirthdate !== calculated.oldest) {
      next.oldestBirthdate = division.oldestBirthdate;
    }
    if (division.youngestBirthdate && division.youngestBirthdate !== calculated.youngest) {
      next.youngestBirthdate = division.youngestBirthdate;
    }
    if (division.cutoffPreset) next.cutoffPreset = division.cutoffPreset;
    return next;
  });
}

export function validateLeagueDefaults(
  input: unknown,
): { ok: true; data: LeagueDefaultsInput } | { ok: false; error: string; issues: string[] } {
  const parsed = leagueDefaultsSchema.safeParse(input);
  if (!parsed.success) return failure(issueList(parsed.error));
  const divisions = numberDivisions(
    parsed.data.divisions.map((division) => {
      const next: DivisionAgeConfig = {
        code: division.code,
        label: division.label,
        minAge: division.minAge,
        maxAge: division.maxAge,
        sortOrder: division.sortOrder,
      };
      if (division.rosterMin != null) next.rosterMin = division.rosterMin;
      if (division.rosterMax != null) next.rosterMax = division.rosterMax;
      return next;
    }),
  );
  return {
    ok: true,
    data: {
      cutoffMonth: parsed.data.cutoffMonth,
      cutoffDay: parsed.data.cutoffDay,
      yearOffset: parsed.data.yearOffset,
      divisions,
      returnRatePercent: parsed.data.returnRatePercent ?? DEFAULT_RETURN_RATE_PERCENT,
      feederSharePercent: parsed.data.feederSharePercent ?? DEFAULT_FEEDER_SHARE_PERCENT,
    },
  };
}

export function validateSeasonRecord(
  input: unknown,
  seasonYear: number,
): { ok: true; data: SeasonDivisionAgesRecord } | { ok: false; error: string; issues: string[] } {
  const parsed = seasonDivisionAgesSchema.safeParse(input);
  if (!parsed.success) return failure(issueList(parsed.error));
  const divisions = numberDivisions(parsed.data.divisions);
  const range = rangeIssues(divisions, parsed.data.cutoff, seasonYear);
  if (range.length > 0) return failure(range);
  const data: SeasonDivisionAgesRecord = {
    cutoff: parsed.data.cutoff,
    divisions,
  };
  if (parsed.data.confirmedAt) data.confirmedAt = parsed.data.confirmedAt;
  if (parsed.data.confirmedByAdminId) data.confirmedByAdminId = parsed.data.confirmedByAdminId;
  if (parsed.data.updatedAt) data.updatedAt = parsed.data.updatedAt;
  if (parsed.data.updatedByAdminId) data.updatedByAdminId = parsed.data.updatedByAdminId;
  return { ok: true, data: attachPrevious(data, input) };
}

export type SeasonWrite =
  | { reset: true }
  | { reset: false; confirm: boolean; cutoff: LeagueAgeRule; divisions: DivisionAgeConfig[] };

export function validateSeasonWrite(
  input: unknown,
  seasonYear: number,
): { ok: true; data: SeasonWrite } | { ok: false; error: string; issues: string[] } {
  if (seasonResetSchema.safeParse(input).success) return { ok: true, data: { reset: true } };
  const parsed = seasonDivisionAgesWriteSchema.safeParse(input);
  if (!parsed.success) return failure(issueList(parsed.error));
  const divisions = numberDivisions(parsed.data.divisions);
  const range = rangeIssues(divisions, parsed.data.cutoff, seasonYear);
  if (range.length > 0) return failure(range);
  return {
    ok: true,
    data: {
      reset: false,
      confirm: parsed.data.confirm === true,
      cutoff: parsed.data.cutoff,
      divisions,
    },
  };
}
