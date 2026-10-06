/**
 * Presentation for the Spring "Current vs proposed" table.
 * The collapsed summary, bar widths, and delta signs are display only.
 * Pools, expected counts, and team totals stay on the forecast result.
 */

import { formatTeamRange } from "./forecastView";
import { springLeagueOf, type SpringLeagueId } from "./springTimeline";

/** Per-browser Spring preference. Fall does not read or write this key. */
export const SPRING_COMPARISON_STORAGE_KEY = "gdb-division-ages-spring-current-vs-proposed-open";

export const SPRING_COMPARISON_PANEL_ID = "division-ages-spring-current-vs-proposed";

const MINUS = "\u2212";

export function readSpringComparisonOpen(
  storage: { getItem(key: string): string | null } | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SPRING_COMPARISON_STORAGE_KEY) === "open";
  } catch {
    return false;
  }
}

export function writeSpringComparisonOpen(
  storage: { setItem(key: string, value: string): void } | null | undefined,
  open: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(SPRING_COMPARISON_STORAGE_KEY, open ? "open" : "closed");
  } catch {
    /* ignore quota / private mode */
  }
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US");
}

/** Signed count for the comparison delta. Zero and non-finite values stay `0`. */
export function formatComparisonDelta(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0) || value === 0) return "0";
  const magnitude = Math.abs(value).toLocaleString("en-US");
  return value > 0 ? `+${magnitude}` : `${MINUS}${magnitude}`;
}

export function comparisonDeltaSign(value: number): "positive" | "negative" | "zero" {
  if (!Number.isFinite(value) || value === 0) return "zero";
  return value > 0 ? "positive" : "negative";
}

/** Signed endpoint inside a team-range delta. Zero stays `+0` so `+0 to +1` stays readable. */
function signedTeamEndpoint(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0) || value === 0) return "+0";
  return formatComparisonDelta(value);
}

/**
 * Spring comparison only. Equal movement is one signed number (`+1`).
 * Unequal ends read as `+0 to +1`, not `+0–+1`. Both ends at 0 stay `0`.
 */
export function formatComparisonTeamDelta(minDelta: number, maxDelta: number): string {
  const min = Number.isFinite(minDelta) ? minDelta : 0;
  const max = Number.isFinite(maxDelta) ? maxDelta : 0;
  if (min === max) return formatComparisonDelta(min);
  return `${signedTeamEndpoint(min)} to ${signedTeamEndpoint(max)}`;
}

export function comparisonTeamDeltaUnchanged(minDelta: number, maxDelta: number): boolean {
  const min = Number.isFinite(minDelta) ? minDelta : 0;
  const max = Number.isFinite(maxDelta) ? maxDelta : 0;
  return min === 0 && max === 0;
}

type ComparisonNote = { note: string; evenSplit?: boolean } | null | undefined;

/**
 * One copy of each Spring row note. The proposed sentence wins when both
 * sides have text and they differ. A blank proposed note keeps the current
 * sentence, which is the only explanation of that column.
 */
function chosenRowNote(current: ComparisonNote, proposed: ComparisonNote): ComparisonNote {
  const proposedNote = proposed?.note?.trim() ?? "";
  const currentNote = current?.note?.trim() ?? "";
  if (!proposedNote) return currentNote ? current : null;
  if (currentNote && currentNote !== proposedNote) return proposed;
  return proposed;
}

export function comparisonRowNotes(
  currentLeague: ComparisonNote,
  proposedLeague: ComparisonNote,
  currentMix: ComparisonNote,
  proposedMix: ComparisonNote,
): { note: string; evenSplit: boolean; testId: string }[] {
  const notes: { note: string; evenSplit: boolean; testId: string }[] = [];
  const league = chosenRowNote(currentLeague, proposedLeague);
  const leagueNote = league?.note?.trim() ?? "";
  if (league && leagueNote) {
    const evenSplit = Boolean(league.evenSplit);
    notes.push({ note: leagueNote, evenSplit, testId: evenSplit ? "league-mix-even-split" : "league-mix-share" });
  }
  const mix = chosenRowNote(currentMix, proposedMix);
  const mixNote = mix?.note?.trim() ?? "";
  if (mix && mixNote) {
    const evenSplit = Boolean(mix.evenSplit);
    notes.push({ note: mixNote, evenSplit, testId: evenSplit ? "mix-even-split" : "mix-share" });
  }
  return notes;
}

type TeamSpan = { min: number; max: number };

function teamsReady(side: TeamSpan | null | undefined): side is TeamSpan {
  return side != null && Number.isFinite(side.min) && Number.isFinite(side.max);
}

/**
 * One line under the Current vs proposed header while the table is collapsed.
 * Current and Proposed are the league expected totals (each player once).
 * The signed change is that same expected delta. Team ranges use the league
 * sides already shown in the table; a non-finite range drops the teams clause.
 */
export function springComparisonSummary(input: {
  current: number;
  proposed: number;
  delta: number;
  currentTeams?: TeamSpan | null;
  proposedTeams?: TeamSpan | null;
}): string {
  const head = `Current ${formatCount(input.current)} · Proposed ${formatCount(input.proposed)} · ${formatComparisonDelta(input.delta)} players`;
  if (!teamsReady(input.currentTeams) || !teamsReady(input.proposedTeams)) return head;
  const currentTeams = formatTeamRange(input.currentTeams.min, input.currentTeams.max);
  const proposedTeams = formatTeamRange(input.proposedTeams.min, input.proposedTeams.max);
  return `${head} · teams ${currentTeams} → ${proposedTeams}`;
}

export function springComparisonSummaryFromLeague(league: {
  current: { expected: number; minTeams: number; maxTeams: number };
  proposed: { expected: number; minTeams: number; maxTeams: number };
  delta: { expected: number };
}): string {
  return springComparisonSummary({
    current: league.current.expected,
    proposed: league.proposed.expected,
    delta: league.delta.expected,
    currentTeams: { min: league.current.minTeams, max: league.current.maxTeams },
    proposedTeams: { min: league.proposed.minTeams, max: league.proposed.maxTeams },
  });
}

/**
 * Width of one comparison bar as a percent of the largest current or proposed
 * value in the visible table. Zero, negative, and non-finite values are an
 * empty track. A table whose max is 0 or NaN stays empty. Rounded to a tenth.
 */
export function comparisonBarPercent(value: number, max: number): number {
  const n = Number.isFinite(value) ? value : 0;
  const m = Number.isFinite(max) ? max : 0;
  if (!(m > 0) || !(n > 0)) return 0;
  return Math.round(Math.min(100, (n / m) * 100) * 10) / 10;
}

export function comparisonBarScale(
  pairs: readonly { current: number; proposed: number }[],
): { current: number; proposed: number }[] {
  let max = 0;
  for (const pair of pairs) {
    for (const value of [pair.current, pair.proposed]) {
      if (Number.isFinite(value) && value > max) max = value;
    }
  }
  return pairs.map((pair) => ({
    current: comparisonBarPercent(pair.current, max),
    proposed: comparisonBarPercent(pair.proposed, max),
  }));
}

type ComparisonSide = {
  pool: number;
  expected: number;
  minTeams: number;
  maxTeams: number;
};

/** A row is muted only when every displayed count on both sides is 0. */
export function comparisonRowMuted(current: ComparisonSide, proposed: ComparisonSide): boolean {
  const values = [current, proposed].flatMap((side) => [side.pool, side.expected, side.minTeams, side.maxTeams]);
  return values.every((value) => Number.isFinite(value) && value === 0);
}

export type SpringComparisonBarEntry = {
  key: string;
  code: string;
  label: string;
  current: ComparisonSide | null;
  proposed: ComparisonSide | null;
};

export type SpringComparisonBarSlot = {
  league: SpringLeagueId;
  currentPercent: number;
  proposedPercent: number;
  muted: boolean;
};

export function buildSpringComparisonBars(
  input: {
    entries: readonly SpringComparisonBarEntry[];
    leagueFallback: SpringLeagueId | null;
  },
): Record<string, SpringComparisonBarSlot> {
  const widths = comparisonBarScale(
    input.entries.map((entry) => ({
      current: entry.current && Number.isFinite(entry.current.expected) ? entry.current.expected : Number.NaN,
      proposed: entry.proposed && Number.isFinite(entry.proposed.expected) ? entry.proposed.expected : Number.NaN,
    })),
  );
  const slots: Record<string, SpringComparisonBarSlot> = {};
  input.entries.forEach((entry, index) => {
    const width = widths[index] ?? { current: 0, proposed: 0 };
    slots[entry.key] = {
      league: springLeagueOf({ code: entry.code, label: entry.label }, input.leagueFallback),
      currentPercent: width.current,
      proposedPercent: width.proposed,
      muted: Boolean(entry.current && entry.proposed && comparisonRowMuted(entry.current, entry.proposed)),
    };
  });
  return slots;
}
