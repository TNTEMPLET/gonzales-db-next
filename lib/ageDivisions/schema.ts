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

const leagueDivisionListSchema = z
  .array(leagueDivisionSchema)
  .max(MAX_DIVISION_COUNT, "Keep the list to 40 divisions or fewer.")
  .superRefine(uniqueDivisionCodes);

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
};

export type SeasonDivisionAgesRecord = {
  cutoff: LeagueAgeRule;
  divisions: DivisionAgeConfig[];
  confirmedAt?: string;
  confirmedByAdminId?: string;
  updatedAt?: string;
  updatedByAdminId?: string;
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
};

export type LeagueDefaultsView = {
  source: "league" | "builtin";
  storageReady: boolean;
  storageNote: string | null;
  cutoffMonth: number;
  cutoffDay: number;
  yearOffset: number;
  divisions: DivisionAgeConfig[];
  updatedAt: string | null;
  updatedByAdminId: string | null;
};

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
    return next;
  });
}

export function validateLeagueDefaults(
  input: unknown,
): { ok: true; data: LeagueDefaultsInput } | { ok: false; error: string; issues: string[] } {
  const parsed = leagueDefaultsSchema.safeParse(input);
  if (!parsed.success) return failure(issueList(parsed.error));
  const divisions = numberDivisions(
    parsed.data.divisions.map((division) => ({
      code: division.code,
      label: division.label,
      minAge: division.minAge,
      maxAge: division.maxAge,
      sortOrder: division.sortOrder,
    })),
  );
  return {
    ok: true,
    data: {
      cutoffMonth: parsed.data.cutoffMonth,
      cutoffDay: parsed.data.cutoffDay,
      yearOffset: parsed.data.yearOffset,
      divisions,
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
  return { ok: true, data };
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
