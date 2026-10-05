/**
 * Presentation for the Spring forecast divisions table.
 * Bar widths, the collapsed summary, and combined-view league-share
 * sentences are display only. Shares, pools, and team counts stay on
 * the forecast result.
 */

import type { LeagueMix } from "./forecastMix";
import { formatMixSeasonSpan } from "./forecastMix";
import { formatTeamRange } from "./forecastView";
import { springLeagueLabel, springLeagueOf, type SpringLeagueId } from "./springTimeline";

/** Per-browser Spring preference. Fall does not read or write this key. */
export const SPRING_FORECAST_TABLE_STORAGE_KEY = "gdb-division-ages-spring-forecast-table-open";

export const SPRING_LEAGUE_SHARE_FOOTNOTE =
  "Kids who fit both an LLB and a DYB division are split by last Spring's league mix for their age, so league totals can differ from last year's overall split.";

/** Muted fills. DYB matches the violet league badge; LLB matches the sky badge. */
export const SPRING_FORECAST_BAR_COLOR = {
  dyb: "#8b7cc9",
  llb: "#4c9ec0",
} as const;

const LEAGUE_LABEL = { gonzales: "DYB", ascension: "LLB" } as const;

export function readSpringForecastTableOpen(
  storage: { getItem(key: string): string | null } | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SPRING_FORECAST_TABLE_STORAGE_KEY) === "open";
  } catch {
    return false;
  }
}

export function writeSpringForecastTableOpen(
  storage: { setItem(key: string, value: string): void } | null | undefined,
  open: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(SPRING_FORECAST_TABLE_STORAGE_KEY, open ? "open" : "closed");
  } catch {
    /* ignore quota / private mode */
  }
}

export function formatForecastCount(value: number): string {
  const count = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return count.toLocaleString("en-US");
}

/**
 * One line under the Divisions header while the table is collapsed.
 * `expected` and the team range are the league totals (each player once).
 */
export function springForecastTableSummary(input: {
  divisionCount: number;
  expected: number;
  minTeams: number;
  maxTeams: number;
}): string {
  const count = Number.isFinite(input.divisionCount) ? Math.max(0, Math.trunc(input.divisionCount)) : 0;
  const expected = Number.isFinite(input.expected) ? Math.max(0, Math.round(input.expected)) : 0;
  const minTeams = Number.isFinite(input.minTeams) ? Math.max(0, Math.trunc(input.minTeams)) : 0;
  const maxTeams = Number.isFinite(input.maxTeams) ? Math.max(0, Math.trunc(input.maxTeams)) : 0;
  const lo = Math.min(minTeams, maxTeams);
  const hi = Math.max(minTeams, maxTeams);
  const divisions = `${count.toLocaleString("en-US")} ${count === 1 ? "division" : "divisions"}`;
  const expectedText = `${expected.toLocaleString("en-US")} expected`;
  const teams =
    lo === hi
      ? `${lo.toLocaleString("en-US")} ${lo === 1 ? "team" : "teams"}`
      : `${lo.toLocaleString("en-US")}\u2013${hi.toLocaleString("en-US")} teams`;
  return `${divisions} · ${expectedText} · ${teams}`;
}

/**
 * Width of one Expected bar as a percent of the longest Expected in the
 * visible table. A zero row, or a table whose max is 0, is an empty track.
 * Rounded to a tenth so the painted width stays stable.
 */
export function expectedBarPercent(expected: number, maxExpected: number): number {
  const value = Number.isFinite(expected) ? expected : 0;
  const max = Number.isFinite(maxExpected) ? maxExpected : 0;
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.round(Math.min(100, (value / max) * 100) * 10) / 10;
}

export function springForecastBarPercents(expecteds: readonly number[]): number[] {
  let max = 0;
  for (const value of expecteds) {
    if (Number.isFinite(value) && value > max) max = value;
  }
  return expecteds.map((value) => expectedBarPercent(value, max));
}

/**
 * Combined Spring only. Turns the stored league-share sentence into plain
 * language. A 0% share means that league had no registrations at the age.
 * Even-split copy is unchanged. The share number is not recomputed.
 */
export function springLeagueShareNote(mix: LeagueMix): string {
  if (mix.evenSplit) return mix.note;
  const label = LEAGUE_LABEL[mix.league];
  const percent = Number.isFinite(mix.sharePercent) ? Math.round(mix.sharePercent) : Math.round((mix.share || 0) * 100);
  if (percent <= 0) return `No ${label} registrations at this age last Spring`;
  if (mix.seasons.length > 1) {
    const span = formatMixSeasonSpan(mix.seasons);
    if (span) return `${label} ${percent}% of kids this age, avg of Spring ${span}`;
  }
  return `${label} ${percent}% of kids this age last Spring`;
}

export type SpringForecastDivisionInput = {
  code: string;
  label: string;
  sortOrder: number;
  inWindow: number;
  expected: number;
  minTeams: number;
  maxTeams: number;
  leagueMix?: LeagueMix | null;
  mixNote?: string | null;
};

export type SpringForecastTableRow = {
  code: string;
  label: string;
  league: SpringLeagueId;
  leagueLabel: "DYB" | "LLB";
  inWindowLabel: string;
  expectedLabel: string;
  teamsLabel: string;
  expected: number;
  notes: string[];
  muted: boolean;
  barPercent: number;
};

export type SpringForecastTableModel = {
  summary: string;
  rows: SpringForecastTableRow[];
};

function whole(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function rounded(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function teamsLabel(minTeams: number, maxTeams: number): string {
  const lo = Math.min(whole(minTeams), whole(maxTeams));
  const hi = Math.max(whole(minTeams), whole(maxTeams));
  if (lo === hi) return formatForecastCount(lo);
  return formatTeamRange(lo, hi);
}

export function buildSpringForecastTable(input: {
  rows: readonly SpringForecastDivisionInput[];
  springCombined: boolean;
  leagueFallback: SpringLeagueId | null;
  expected: number;
  minTeams: number;
  maxTeams: number;
}): SpringForecastTableModel {
  const ordered = [...input.rows].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  const expecteds = ordered.map((row) => rounded(row.expected));
  const widths = springForecastBarPercents(expecteds);
  const rows: SpringForecastTableRow[] = ordered.map((row, index) => {
    const league = springLeagueOf(row, input.leagueFallback);
    const expected = expecteds[index] ?? 0;
    const notes: string[] = [];
    if (input.springCombined && row.leagueMix) notes.push(springLeagueShareNote(row.leagueMix));
    if (row.mixNote) notes.push(row.mixNote);
    return {
      code: row.code,
      label: row.label,
      league,
      leagueLabel: springLeagueLabel(league),
      inWindowLabel: formatForecastCount(row.inWindow),
      expectedLabel: formatForecastCount(expected),
      teamsLabel: teamsLabel(row.minTeams, row.maxTeams),
      expected,
      notes,
      muted: expected === 0,
      barPercent: widths[index] ?? 0,
    };
  });
  return {
    summary: springForecastTableSummary({
      divisionCount: rows.length,
      expected: input.expected,
      minTeams: input.minTeams,
      maxTeams: input.maxTeams,
    }),
    rows,
  };
}

type ForecastTableSource = {
  rows: readonly {
    code: string;
    label: string;
    sortOrder: number;
    proposed: { pool: number; expected: number; minTeams: number; maxTeams: number };
    proposedLeagueMix?: LeagueMix | null;
    proposedMix?: { note: string } | null;
  }[];
  league: { proposed: { expected: number; minTeams: number; maxTeams: number } };
};

/** Proposed side only. League totals are the collapsed summary, not a sum of rows. */
export function springForecastTableModelFromForecast(
  forecast: ForecastTableSource,
  options: { springCombined: boolean; leagueFallback: SpringLeagueId | null },
): SpringForecastTableModel {
  return buildSpringForecastTable({
    springCombined: options.springCombined,
    leagueFallback: options.leagueFallback,
    expected: forecast.league.proposed.expected,
    minTeams: forecast.league.proposed.minTeams,
    maxTeams: forecast.league.proposed.maxTeams,
    rows: forecast.rows.map((row) => ({
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
      inWindow: row.proposed.pool,
      expected: row.proposed.expected,
      minTeams: row.proposed.minTeams,
      maxTeams: row.proposed.maxTeams,
      leagueMix: row.proposedLeagueMix ?? null,
      mixNote: row.proposedMix?.note ?? null,
    })),
  });
}
