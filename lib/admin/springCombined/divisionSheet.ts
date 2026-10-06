/**
 * Rows for the Spring combined Divisions tab and its PDF.
 * Built from the saved league tables the tab already loads. The builder
 * scratch table is not read here.
 */

import { calculatedRange, effectiveCutoffDate, effectiveRange } from "@/lib/ageDivisions/compute";
import { formatCalendarDate } from "@/lib/ageDivisions/present";
import type { CutoffPreset, DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";
import { getOrgDisplayName } from "@/lib/siteConfig";

import { cutoffPresetLabel } from "./save";
import {
  leagueTaggedDivisionName,
  type SpringLeagueDivisions,
  type SpringLeagueOrg,
  type TaggedDivisionRow,
} from "./view";

const STANDARD_CUTOFFS = {
  "little-league": { cutoffMonth: 8, cutoffDay: 31 },
  dyb: { cutoffMonth: 4, cutoffDay: 30 },
} as const;

export type SpringDivisionSheetRow = TaggedDivisionRow & {
  league: string;
  ages: string;
  cutoff: string;
  oldestLabel: string;
  youngestLabel: string;
};

/** Same age text the Divisions tab shows: "8U" or "7–8". */
export function springDivisionAgeLabel(minAge: number, maxAge: number): string {
  if (minAge === maxAge) return `${minAge}U`;
  return `${minAge}–${maxAge}`;
}

function sameWindow(left: { oldest: string; youngest: string }, right: { oldest: string; youngest: string }): boolean {
  return left.oldest === right.oldest && left.youngest === right.youngest;
}

/** Matches the preset a combined save stores when the row has no badge yet. */
function inferredCutoffPreset(
  division: Pick<DivisionAgeConfig, "minAge" | "maxAge">,
  window: { oldest: string; youngest: string },
  seasonYear: number,
  yearOffset: number,
): CutoffPreset {
  for (const preset of ["little-league", "dyb"] as const) {
    const iso = effectiveCutoffDate({ ...STANDARD_CUTOFFS[preset], yearOffset }, seasonYear);
    if (sameWindow(window, calculatedRange(division, iso))) return preset;
  }
  return "custom";
}

export function springDivisionCutoffLabel(
  division: DivisionAgeConfig,
  cutoff: LeagueAgeRule,
  seasonYear: number,
  window: { oldest: string; youngest: string },
): string {
  const preset =
    division.cutoffPreset ?? inferredCutoffPreset(division, window, seasonYear, cutoff.yearOffset);
  return cutoffPresetLabel(preset);
}

/**
 * One row per saved division, in the same league-then-division order as
 * `taggedDivisionRows`.
 */
export function springDivisionSheetRows(
  leagues: readonly SpringLeagueDivisions[],
  seasonYear: number,
): SpringDivisionSheetRow[] {
  const rows: SpringDivisionSheetRow[] = [];
  for (const league of leagues) {
    if (league.organizationId !== "gonzales" && league.organizationId !== "ascension") continue;
    const organizationId: SpringLeagueOrg = league.organizationId;
    const cutoffIso = effectiveCutoffDate(league.cutoff, seasonYear);
    for (const division of league.divisions) {
      const savedName = division.label.trim() || division.code;
      const range = effectiveRange(division, cutoffIso);
      rows.push({
        organizationId,
        code: `${organizationId}:${division.code}`,
        savedName,
        displayName: leagueTaggedDivisionName(savedName, organizationId),
        minAge: division.minAge,
        maxAge: division.maxAge,
        oldest: range.oldest,
        youngest: range.youngest,
        league: getOrgDisplayName(organizationId),
        ages: springDivisionAgeLabel(division.minAge, division.maxAge),
        cutoff: springDivisionCutoffLabel(division, league.cutoff, seasonYear, range),
        oldestLabel: range.oldest ? formatCalendarDate(range.oldest) : "",
        youngestLabel: range.youngest ? formatCalendarDate(range.youngest) : "",
      });
    }
  }
  return rows;
}

export function springDivisionsPdfFilename(seasonYear: number): string {
  return `AP-Baseball-Spring-${seasonYear}-Divisions.pdf`;
}
