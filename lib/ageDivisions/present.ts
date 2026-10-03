/**
 * Display helpers for the read-only Division Ages page. Pure date and
 * string formatting on top of the calculator — still no I/O.
 */

import type { ContentOrgId } from "@/lib/siteConfig";

import {
  coverageWarnings,
  effectiveCutoffDate,
  effectiveRange,
  eligibleDivisions,
  exactAge,
  leagueAge,
} from "./compute";
import { leagueDivisionDefaults } from "./defaults";
import type { ExactAge, LeagueAgeRule, LeagueDivisionConfig } from "./types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "May 1, 2019". Unparseable input is returned unchanged. */
export function formatCalendarDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = SHORT_MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(match[3])}, ${match[1]}`;
}

/** "7" or "7–8". */
export function formatAgeSpan(minAge: number, maxAge: number): string {
  if (minAge === maxAge) return String(minAge);
  return `${minAge}–${maxAge}`;
}

/** "7 yrs, 9 mos" / "8 yrs, 1 mo". Empty when the age could not be read. */
export function formatExactAgeLabel(age: ExactAge): string {
  if (!Number.isFinite(age.years) || !Number.isFinite(age.months)) return "";
  const years = Math.trunc(age.years);
  const months = Math.trunc(age.months);
  const yearLabel = years === 1 ? "1 yr" : `${years} yrs`;
  const monthLabel = months === 1 ? "1 mo" : `${months} mos`;
  return `${yearLabel}, ${monthLabel}`;
}

function configFor(org: ContentOrgId): LeagueDivisionConfig {
  return leagueDivisionDefaults(org);
}

/** The standing league rule, in words. */
export function leagueRuleSentenceForRule(org: ContentOrgId, rule: LeagueAgeRule): string {
  const month = MONTHS[rule.cutoffMonth - 1] ?? "January";
  const family =
    org === "gonzales" ? "Dixie Youth" : org === "ascension" ? "Little League" : "Fall Ball";
  const when =
    rule.yearOffset === 0
      ? "of the season year"
      : rule.yearOffset === 1
        ? "of the following year"
        : `${rule.yearOffset} years after the season year`;
  return `${family}: ages as of ${month} ${rule.cutoffDay} ${when}.`;
}

export function leagueRuleSentence(org: ContentOrgId): string {
  return leagueRuleSentenceForRule(org, configFor(org).rule);
}

/** "Fall 2026 → ages as of Apr 30, 2027". */
export function seasonAgeHeadlineForRule(org: ContentOrgId, rule: LeagueAgeRule, seasonYear: number): string {
  const cutoff = effectiveCutoffDate(rule, seasonYear);
  const season = org === "fallball" ? `Fall ${seasonYear}` : `Spring ${seasonYear}`;
  return `${season} → ages as of ${formatCalendarDate(cutoff)}`;
}

export function seasonAgeHeadline(org: ContentOrgId, seasonYear: number): string {
  return seasonAgeHeadlineForRule(org, configFor(org).rule, seasonYear);
}

export type DivisionAgeRow = {
  code: string;
  label: string;
  minAge: number;
  maxAge: number;
  ageSpan: string;
  oldest: string;
  youngest: string;
  oldestLabel: string;
  youngestLabel: string;
  oldestOverridden: boolean;
  youngestOverridden: boolean;
};

export function divisionAgeRowsForConfig(config: LeagueDivisionConfig, seasonYear: number): DivisionAgeRow[] {
  const cutoff = effectiveCutoffDate(config.rule, seasonYear);
  return [...config.divisions]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((division) => {
      const range = effectiveRange(division, cutoff);
      return {
        code: division.code,
        label: division.label,
        minAge: division.minAge,
        maxAge: division.maxAge,
        ageSpan: formatAgeSpan(division.minAge, division.maxAge),
        oldest: range.oldest,
        youngest: range.youngest,
        oldestLabel: formatCalendarDate(range.oldest),
        youngestLabel: formatCalendarDate(range.youngest),
        oldestOverridden: range.oldestOverridden,
        youngestOverridden: range.youngestOverridden,
      };
    });
}

export function divisionAgeRows(org: ContentOrgId, seasonYear: number): DivisionAgeRow[] {
  return divisionAgeRowsForConfig(configFor(org), seasonYear);
}

/** TSV for Sports Connect: division, min age, max age, oldest, youngest. Dates stay ISO. */
export function divisionTableTsvForConfig(config: LeagueDivisionConfig, seasonYear: number): string {
  const lines = ["division\tmin age\tmax age\toldest\tyoungest"];
  for (const row of divisionAgeRowsForConfig(config, seasonYear)) {
    lines.push(
      [row.label, String(row.minAge), String(row.maxAge), row.oldest, row.youngest].join("\t"),
    );
  }
  return lines.join("\n");
}

export function divisionTableTsv(org: ContentOrgId, seasonYear: number): string {
  return divisionTableTsvForConfig(configFor(org), seasonYear);
}

function labelFor(config: LeagueDivisionConfig, code: string): string {
  return config.divisions.find((division) => division.code === code)?.label ?? code;
}

/** One readable line per gap, overlap, or invalid range. */
export function coverageWarningLinesForConfig(config: LeagueDivisionConfig, seasonYear: number): string[] {
  const cutoff = effectiveCutoffDate(config.rule, seasonYear);
  return coverageWarnings(config.divisions, cutoff).map((warning) => {
    const names = warning.divisionCodes.map((code) => labelFor(config, code)).join(", ");
    const span = `${formatCalendarDate(warning.from)} – ${formatCalendarDate(warning.to)}`;
    if (warning.kind === "gap") return `Gap: ${names}, ${span}.`;
    if (warning.kind === "overlap") return `Overlap: ${names}, ${span}.`;
    return `Invalid range: ${names}, ${span}.`;
  });
}

export function coverageWarningLines(org: ContentOrgId, seasonYear: number): string[] {
  return coverageWarningLinesForConfig(configFor(org), seasonYear);
}

export type LeagueLookup = {
  org: ContentOrgId;
  leagueAge: number;
  exactAgeLabel: string;
  divisionLabels: string[];
};

export function lookupLeagueForConfig(
  org: ContentOrgId,
  config: LeagueDivisionConfig,
  birthDate: string,
  seasonYear: number,
): LeagueLookup {
  const cutoff = effectiveCutoffDate(config.rule, seasonYear);
  return {
    org,
    leagueAge: leagueAge(birthDate, cutoff),
    exactAgeLabel: formatExactAgeLabel(exactAge(birthDate, cutoff)),
    divisionLabels: eligibleDivisions(birthDate, config, seasonYear).map((division) => division.label),
  };
}

export function lookupLeague(org: ContentOrgId, birthDate: string, seasonYear: number): LeagueLookup {
  return lookupLeagueForConfig(org, configFor(org), birthDate, seasonYear);
}

/** True when the displayed leagues do not all give this birthdate the same age. */
export function lookupIsSplit(orgs: readonly ContentOrgId[], birthDate: string, seasonYear: number): boolean {
  if (orgs.length < 2) return false;
  const ages = orgs
    .map((org) => lookupLeague(org, birthDate, seasonYear).leagueAge)
    .filter((age) => Number.isFinite(age));
  return new Set(ages).size > 1;
}
