/**
 * Calendar-date age and division-range math. Every date is a `YYYY-MM-DD`
 * string or a UTC-midnight `Date`. Local time zones are never consulted.
 */

import type {
  BirthdateRange,
  CoverageWarning,
  DivisionAgeConfig,
  EffectiveBirthdateRange,
  ExactAge,
  LeagueAgeRule,
  LeagueDivisionConfig,
} from "./types";

export type CalendarDate = string | Date;

type Ymd = { year: number; month: number; day: number };

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatYmd(year: number, month: number, day: number): string {
  const y = String(Math.trunc(year)).padStart(4, "0");
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseYmd(value: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function coerceYmd(value: CalendarDate | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const formatted = formatYmd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    return parseYmd(formatted) ? formatted : null;
  }
  if (typeof value !== "string") return null;
  return parseYmd(value) ? value.trim() : null;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const truncated = Math.trunc(value);
  if (truncated < min) return min;
  if (truncated > max) return max;
  return truncated;
}

/** Move a calendar date by whole years. Feb 29 lands on Feb 28 when the target year is not a leap year. */
export function shiftIsoDateByYears(iso: string, years: number): string {
  if (!Number.isFinite(years)) return "";
  return addYears(iso, years);
}

function addYears(iso: string, years: number): string {
  const parsed = parseYmd(iso);
  if (!parsed || !Number.isFinite(years)) return "";
  const year = parsed.year + Math.trunc(years);
  const day = Math.min(parsed.day, daysInMonth(year, parsed.month));
  return formatYmd(year, parsed.month, day);
}

function addDays(iso: string, days: number): string {
  const parsed = parseYmd(iso);
  if (!parsed || !Number.isFinite(days)) return "";
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  utc.setUTCDate(utc.getUTCDate() + Math.trunc(days));
  return formatYmd(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function overrideDate(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Cutoff date for a season: `seasonYear + yearOffset`, with an impossible
 * day (29 Feb in a non-leap year, day 31 in a 30-day month) clamped to the
 * last day of that month.
 */
export function effectiveCutoffDate(rule: LeagueAgeRule, seasonYear: number): string {
  const year = (Number.isFinite(seasonYear) ? Math.trunc(seasonYear) : 0) +
    (Number.isFinite(rule.yearOffset) ? Math.trunc(rule.yearOffset) : 0);
  const month = clampInt(rule.cutoffMonth, 1, 12, 1);
  const day = clampInt(rule.cutoffDay, 1, daysInMonth(year, month), 1);
  return formatYmd(year, month, day);
}

/**
 * Whole years of age on `cutoff`. A birthday that falls on the cutoff counts
 * as having reached that age. Unparseable dates return `NaN` (no throw).
 */
export function leagueAge(birthDate: CalendarDate, cutoff: CalendarDate): number {
  const birth = coerceYmd(birthDate);
  const cut = coerceYmd(cutoff);
  if (!birth || !cut) return Number.NaN;
  const born = parseYmd(birth)!;
  const on = parseYmd(cut)!;
  let age = on.year - born.year;
  const birthdayAfterCutoff =
    born.month > on.month || (born.month === on.month && born.day > on.day);
  if (birthdayAfterCutoff) age -= 1;
  return age;
}

/** Sheet-style "N yrs, M mos": completed years plus completed months since the last birthday. */
export function exactAge(birthDate: CalendarDate, cutoff: CalendarDate): ExactAge {
  const birth = coerceYmd(birthDate);
  const cut = coerceYmd(cutoff);
  if (!birth || !cut) return { years: Number.NaN, months: Number.NaN };
  const born = parseYmd(birth)!;
  const on = parseYmd(cut)!;
  let months = on.month - born.month;
  if (on.day < born.day) months -= 1;
  if (months < 0) months += 12;
  return { years: leagueAge(birth, cut), months };
}

/**
 * Calculated birthdate window for `minAge..maxAge` on a cutoff.
 * Oldest = cutoff − (maxAge + 1) years + 1 day. Youngest = cutoff − minAge years.
 */
export function calculatedRange(
  division: Pick<DivisionAgeConfig, "minAge" | "maxAge">,
  cutoff: CalendarDate,
): BirthdateRange {
  const cut = coerceYmd(cutoff);
  if (!cut || !Number.isFinite(division.minAge) || !Number.isFinite(division.maxAge)) {
    return { oldest: "", youngest: "" };
  }
  return {
    oldest: addDays(addYears(cut, -(Math.trunc(division.maxAge) + 1)), 1),
    youngest: addYears(cut, -Math.trunc(division.minAge)),
  };
}

/** Calculated range, with a direct oldest/youngest override winning when set. */
export function effectiveRange(division: DivisionAgeConfig, cutoff: CalendarDate): EffectiveBirthdateRange {
  const calculated = calculatedRange(division, cutoff);
  const oldestOverride = overrideDate(division.oldestBirthdate);
  const youngestOverride = overrideDate(division.youngestBirthdate);
  return {
    oldest: oldestOverride ?? calculated.oldest,
    youngest: youngestOverride ?? calculated.youngest,
    oldestOverridden: oldestOverride != null,
    youngestOverridden: youngestOverride != null,
  };
}

function rangeIsUsable(range: BirthdateRange): boolean {
  return parseYmd(range.oldest) != null && parseYmd(range.youngest) != null && range.oldest <= range.youngest;
}

type CoveredDivision = {
  code: string;
  sortOrder: number;
  oldest: string;
  youngest: string;
};

function warningSort(a: CoverageWarning, b: CoverageWarning): number {
  const kindRank = { invalid: 0, gap: 1, overlap: 2 };
  if (kindRank[a.kind] !== kindRank[b.kind]) return kindRank[a.kind] - kindRank[b.kind];
  if (a.from !== b.from) return a.from < b.from ? -1 : 1;
  if (a.to !== b.to) return a.to < b.to ? -1 : 1;
  return a.divisionCodes.join("\0").localeCompare(b.divisionCodes.join("\0"));
}

/**
 * Gaps and overlaps across effective ranges, between the overall oldest and
 * youngest covered dates. Overlaps, gaps, and bad ranges are warnings.
 * This function does not throw.
 */
export function coverageWarnings(divisions: DivisionAgeConfig[], cutoff: CalendarDate): CoverageWarning[] {
  const warnings: CoverageWarning[] = [];
  const covered: CoveredDivision[] = [];
  const ordered = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  for (const division of ordered) {
    const range = effectiveRange(division, cutoff);
    const agesOk =
      Number.isFinite(division.minAge) &&
      Number.isFinite(division.maxAge) &&
      division.minAge <= division.maxAge;
    if (!agesOk || !rangeIsUsable(range)) {
      warnings.push({
        kind: "invalid",
        from: range.oldest,
        to: range.youngest,
        divisionCodes: [division.code],
      });
      continue;
    }
    covered.push({
      code: division.code,
      sortOrder: division.sortOrder,
      oldest: range.oldest,
      youngest: range.youngest,
    });
  }

  for (let i = 0; i < covered.length; i++) {
    for (let j = i + 1; j < covered.length; j++) {
      const left = covered[i]!;
      const right = covered[j]!;
      const from = left.oldest > right.oldest ? left.oldest : right.oldest;
      const to = left.youngest < right.youngest ? left.youngest : right.youngest;
      if (from <= to) {
        warnings.push({
          kind: "overlap",
          from,
          to,
          divisionCodes: [left.code, right.code],
        });
      }
    }
  }

  const merged = mergeCovered(covered);
  for (let i = 0; i < merged.length - 1; i++) {
    const earlier = merged[i]!;
    const later = merged[i + 1]!;
    const from = addDays(earlier.youngest, 1);
    const to = addDays(later.oldest, -1);
    if (!from || !to || from > to) continue;
    const dayBefore = earlier.youngest;
    const dayAfter = later.oldest;
    const divisionCodes = covered
      .filter((range) => range.youngest === dayBefore || range.oldest === dayAfter)
      .map((range) => range.code);
    warnings.push({ kind: "gap", from, to, divisionCodes });
  }

  warnings.sort(warningSort);
  return warnings;
}

function mergeCovered(ranges: CoveredDivision[]): BirthdateRange[] {
  const sorted = [...ranges].sort((a, b) => (a.oldest < b.oldest ? -1 : a.oldest > b.oldest ? 1 : 0));
  const merged: BirthdateRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ oldest: range.oldest, youngest: range.youngest });
      continue;
    }
    const dayAfterLast = addDays(last.youngest, 1);
    if (dayAfterLast && range.oldest <= dayAfterLast) {
      if (range.youngest > last.youngest) last.youngest = range.youngest;
      continue;
    }
    merged.push({ oldest: range.oldest, youngest: range.youngest });
  }
  return merged;
}

function containsBirthdate(range: BirthdateRange, birthDate: string): boolean {
  return rangeIsUsable(range) && birthDate >= range.oldest && birthDate <= range.youngest;
}

/** Every division whose effective range contains `birthDate`, in `sortOrder`. Empty means none. */
export function eligibleDivisions(
  birthDate: CalendarDate,
  config: LeagueDivisionConfig,
  seasonYear: number,
): DivisionAgeConfig[] {
  const born = coerceYmd(birthDate);
  if (!born) return [];
  const cutoff = effectiveCutoffDate(config.rule, seasonYear);
  return [...config.divisions]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .filter((division) => containsBirthdate(effectiveRange(division, cutoff), born));
}

/** True when two league rules give this birthdate different league ages in the same season. */
export function isSplitWindow(
  birthDate: CalendarDate,
  rulesA: LeagueAgeRule,
  rulesB: LeagueAgeRule,
  seasonYear: number,
): boolean {
  const ageA = leagueAge(birthDate, effectiveCutoffDate(rulesA, seasonYear));
  const ageB = leagueAge(birthDate, effectiveCutoffDate(rulesB, seasonYear));
  if (!Number.isFinite(ageA) || !Number.isFinite(ageB)) return false;
  return ageA !== ageB;
}
