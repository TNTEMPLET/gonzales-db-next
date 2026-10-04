/**
 * What a cutoff or birthdate edit does to division headcount.
 * Reuses `compareConfigs` and the team-size range. No database access,
 * and no player names or contact fields.
 */

import { effectiveRange } from "./compute";
import { seasonCutoffIso } from "./draft";
import {
  DEFAULT_RETURN_RATE,
  DEFAULT_ROSTER,
  compareConfigs,
  type BirthBucket,
  type ForecastFlow,
  type ForecastOptions,
  type ForecastRow,
} from "./forecast";
import { formatTimelineDate } from "./forecastTimeline";
import { formatDeltaTeams, type ProposedConfig } from "./forecastView";

export type ShiftedSlice = {
  oldest: string;
  youngest: string;
};

export type DivisionImpact = {
  code: string;
  label: string;
  sortOrder: number;
  beforePlayers: number;
  afterPlayers: number;
  playerDelta: number;
  beforeExpected: number;
  afterExpected: number;
  beforeMinTeams: number;
  beforeMaxTeams: number;
  afterMinTeams: number;
  afterMaxTeams: number;
  minTeamDelta: number;
  maxTeamDelta: number;
  beforeWindow: ShiftedSlice;
  afterWindow: ShiftedSlice;
  /** Birthdates that were in the division and are not in the proposed window. */
  leftDivision: ShiftedSlice[];
  /** Birthdates that are in the proposed window and were not before. */
  enteredDivision: ShiftedSlice[];
};

export type CutoffImpact = {
  /** True when at least one division's players or teams change. */
  changed: boolean;
  summary: string;
  /** Only divisions whose player count or team range changed. */
  divisions: DivisionImpact[];
};

const NONE_LABELS: Record<string, string> = {
  "none:agedOut": "aged out",
  "none:tooYoung": "too young",
  "none:gap": "between divisions",
};

function addDays(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match || !Number.isFinite(days)) return "";
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(utc.getTime())) return "";
  utc.setUTCDate(utc.getUTCDate() + Math.trunc(days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyWindow(): ShiftedSlice {
  return { oldest: "", youngest: "" };
}

function windowFor(config: ProposedConfig, code: string, targetSeasonYear: number): ShiftedSlice {
  const division = config.divisions.find((item) => item.code === code);
  if (!division) return emptyWindow();
  const range = effectiveRange(division, seasonCutoffIso(config.cutoff, targetSeasonYear));
  if (!range.oldest || !range.youngest || range.oldest > range.youngest) return emptyWindow();
  return { oldest: range.oldest, youngest: range.youngest };
}

/** Dates in `source` that are outside `other`. A missing other window means the whole source moved. */
export function windowDifference(source: ShiftedSlice, other: ShiftedSlice): ShiftedSlice[] {
  if (!source.oldest || !source.youngest || source.oldest > source.youngest) return [];
  if (!other.oldest || !other.youngest || other.oldest > other.youngest) {
    return [{ oldest: source.oldest, youngest: source.youngest }];
  }
  if (source.youngest < other.oldest || source.oldest > other.youngest) {
    return [{ oldest: source.oldest, youngest: source.youngest }];
  }
  const slices: ShiftedSlice[] = [];
  if (source.oldest < other.oldest) {
    const end = addDays(other.oldest, -1);
    if (end && source.oldest <= end) slices.push({ oldest: source.oldest, youngest: end });
  }
  if (source.youngest > other.youngest) {
    const start = addDays(other.youngest, 1);
    if (start && start <= source.youngest) slices.push({ oldest: start, youngest: source.youngest });
  }
  return slices;
}

function cutoffChanged(baseline: ProposedConfig, proposed: ProposedConfig): boolean {
  return (
    baseline.cutoff.cutoffMonth !== proposed.cutoff.cutoffMonth ||
    baseline.cutoff.cutoffDay !== proposed.cutoff.cutoffDay ||
    baseline.cutoff.yearOffset !== proposed.cutoff.yearOffset
  );
}

function cutoffLabel(config: ProposedConfig, targetSeasonYear: number, includeYear: boolean): string {
  const formatted = formatTimelineDate(seasonCutoffIso(config.cutoff, targetSeasonYear));
  if (includeYear) return formatted;
  return formatted.replace(/, \d{4}$/, "");
}

type EdgeChange = {
  code: string;
  label: string;
  field: "oldest" | "youngest";
  date: string;
};

function changedEdges(baseline: ProposedConfig, proposed: ProposedConfig, targetSeasonYear: number): EdgeChange[] {
  const labels = new Map<string, string>();
  for (const division of [...baseline.divisions, ...proposed.divisions]) labels.set(division.code, division.label);
  const codes = new Set(labels.keys());
  const edges: EdgeChange[] = [];
  for (const code of codes) {
    const before = windowFor(baseline, code, targetSeasonYear);
    const after = windowFor(proposed, code, targetSeasonYear);
    const label = labels.get(code) ?? code;
    if (after.oldest && before.oldest !== after.oldest) {
      edges.push({ code, label, field: "oldest", date: after.oldest });
    }
    if (after.youngest && before.youngest !== after.youngest) {
      edges.push({ code, label, field: "youngest", date: after.youngest });
    }
  }
  return edges;
}

function signedCount(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

export function formatImpactPlayers(before: number, after: number): string {
  return `${before} → ${after} (${signedCount(after - before)})`;
}

function teamPhraseFor(minDelta: number, maxDelta: number): string {
  if (minDelta === 0 && maxDelta === 0) return "teams unchanged";
  if (minDelta === maxDelta) {
    const count = Math.abs(minDelta);
    return `${signedCount(minDelta)} ${count === 1 ? "team" : "teams"}`;
  }
  return `${formatDeltaTeams(minDelta, maxDelta).replace(/-/g, "−")} teams`;
}

function teamClause(from: DivisionImpact | undefined, to: DivisionImpact | undefined): string {
  const parts = [from, to]
    .filter((division): division is DivisionImpact => division != null)
    .map((division) => teamPhraseFor(division.minTeamDelta, division.maxTeamDelta));
  if (parts.length === 0) return "";
  if (parts.every((part) => part === "teams unchanged")) return "(teams unchanged)";
  return `(${parts.join(" / ")})`;
}

export function formatImpactTeams(division: DivisionImpact): string {
  const before =
    division.beforeMinTeams === division.beforeMaxTeams
      ? String(division.beforeMinTeams)
      : `${division.beforeMinTeams}–${division.beforeMaxTeams}`;
  const after =
    division.afterMinTeams === division.afterMaxTeams
      ? String(division.afterMinTeams)
      : `${division.afterMinTeams}–${division.afterMaxTeams}`;
  const clause = teamPhraseFor(division.minTeamDelta, division.maxTeamDelta);
  return `Teams ${before} → ${after} (${clause})`;
}

export function formatShiftedSlice(slice: ShiftedSlice): string {
  if (!slice.oldest || !slice.youngest) return "";
  const oldest = formatTimelineDate(slice.oldest);
  if (slice.oldest === slice.youngest) return oldest;
  return `${oldest}–${formatTimelineDate(slice.youngest)}`;
}

export function formatWindowShift(division: DivisionImpact): string {
  const before = formatShiftedSlice(division.beforeWindow);
  const after = formatShiftedSlice(division.afterWindow);
  const parts: string[] = [];
  if (before || after) parts.push(`Was ${before || "outside every division"}. Now ${after || "outside every division"}.`);
  const left = division.leftDivision.map(formatShiftedSlice).filter(Boolean);
  const entered = division.enteredDivision.map(formatShiftedSlice).filter(Boolean);
  if (left.length > 0) parts.push(`Left this division: ${left.join("; ")}.`);
  if (entered.length > 0) parts.push(`Entered this division: ${entered.join("; ")}.`);
  return parts.join(" ");
}

function divisionFromRow(
  row: ForecastRow,
  baseline: ProposedConfig,
  proposed: ProposedConfig,
  targetSeasonYear: number,
): DivisionImpact {
  const beforeWindow = windowFor(baseline, row.code, targetSeasonYear);
  const afterWindow = windowFor(proposed, row.code, targetSeasonYear);
  return {
    code: row.code,
    label: row.label,
    sortOrder: row.sortOrder,
    beforePlayers: row.current.pool,
    afterPlayers: row.proposed.pool,
    playerDelta: row.proposed.pool - row.current.pool,
    beforeExpected: row.current.expected,
    afterExpected: row.proposed.expected,
    beforeMinTeams: row.current.minTeams,
    beforeMaxTeams: row.current.maxTeams,
    afterMinTeams: row.proposed.minTeams,
    afterMaxTeams: row.proposed.maxTeams,
    minTeamDelta: row.proposed.minTeams - row.current.minTeams,
    maxTeamDelta: row.proposed.maxTeams - row.current.maxTeams,
    beforeWindow,
    afterWindow,
    leftDivision: windowDifference(beforeWindow, afterWindow),
    enteredDivision: windowDifference(afterWindow, beforeWindow),
  };
}

function countsChanged(division: DivisionImpact): boolean {
  return division.playerDelta !== 0 || division.minTeamDelta !== 0 || division.maxTeamDelta !== 0;
}

function placeLabel(token: string, labels: ReadonlyMap<string, string>): string {
  const named = NONE_LABELS[token];
  if (named) return named;
  if (token.includes("+")) {
    return token
      .split("+")
      .map((code) => labels.get(code) ?? code)
      .join(" and ");
  }
  return labels.get(token) ?? token;
}

function singleDivisionCode(token: string): string | null {
  if (!token || token.startsWith("none:") || token.includes("+")) return null;
  return token;
}

function transferCount(flow: ForecastFlow, from: DivisionImpact | undefined, to: DivisionImpact | undefined): number {
  if (from && to && -from.playerDelta === to.playerDelta && to.playerDelta > 0) return to.playerDelta;
  return flow.total;
}

function flowSentence(
  flow: ForecastFlow,
  byCode: ReadonlyMap<string, DivisionImpact>,
  labels: ReadonlyMap<string, string>,
): string {
  const fromCode = singleDivisionCode(flow.from);
  const toCode = singleDivisionCode(flow.to);
  const from = fromCode ? byCode.get(fromCode) : undefined;
  const to = toCode ? byCode.get(toCode) : undefined;
  const count = transferCount(flow, from, to);
  const players = `${count} ${count === 1 ? "player" : "players"}`;
  const clause = teamClause(from, to);
  const sentence = `moves ${players} from ${placeLabel(flow.from, labels)} to ${placeLabel(flow.to, labels)}`;
  return clause ? `${sentence} ${clause}` : sentence;
}

function actionPrefix(
  baseline: ProposedConfig,
  proposed: ProposedConfig,
  targetSeasonYear: number,
  divisions: readonly DivisionImpact[],
  flows: readonly ForecastFlow[],
): string {
  const divisionFlows = flows.filter((flow) => singleDivisionCode(flow.from) && singleDivisionCode(flow.to));
  if (cutoffChanged(baseline, proposed)) {
    const beforeIso = seasonCutoffIso(baseline.cutoff, targetSeasonYear);
    const afterIso = seasonCutoffIso(proposed.cutoff, targetSeasonYear);
    const when = cutoffLabel(proposed, targetSeasonYear, beforeIso.slice(0, 4) !== afterIso.slice(0, 4));
    const only = divisionFlows.length === 1 ? singleDivisionCode(divisionFlows[0]!.to) : null;
    const destination = only ? divisions.find((division) => division.code === only) : undefined;
    if (destination) return `Moving the ${destination.label} cutoff to ${when}`;
    return `Moving the cutoff to ${when}`;
  }
  const edges = changedEdges(baseline, proposed, targetSeasonYear);
  const gainers = new Set(divisions.filter((division) => division.playerDelta > 0).map((division) => division.code));
  const gainerEdges = edges.filter((edge) => gainers.has(edge.code));
  const chosen = gainerEdges.length === 1 ? gainerEdges[0] : edges.length === 1 ? edges[0] : null;
  if (chosen) {
    const which = chosen.field === "oldest" ? "oldest birthdate" : "youngest birthdate";
    return `Moving the ${chosen.label} ${which} to ${formatTimelineDate(chosen.date)}`;
  }
  if (edges.length > 0) return "Moving these birthdate windows";
  return "This edit";
}

function summarize(
  baseline: ProposedConfig,
  proposed: ProposedConfig,
  targetSeasonYear: number,
  divisions: readonly DivisionImpact[],
  flows: readonly ForecastFlow[],
  labels: ReadonlyMap<string, string>,
): string {
  const moved = cutoffChanged(baseline, proposed) || changedEdges(baseline, proposed, targetSeasonYear).length > 0;
  if (!moved && divisions.length === 0) {
    return "These dates match the starting table. No division changes players or teams.";
  }
  const prefix = actionPrefix(baseline, proposed, targetSeasonYear, divisions, flows);
  if (divisions.length === 0) {
    return `${prefix} does not move any players or change any team counts.`;
  }
  const sentences = flows
    .filter((flow) => flow.total > 0 && flow.from !== flow.to)
    .map((flow) => flowSentence(flow, new Map(divisions.map((division) => [division.code, division])), labels));
  if (sentences.length === 0) {
    const names = divisions.map((division) => division.label).join(", ");
    return `${prefix} changes ${names}.`;
  }
  return `${prefix} ${sentences.join("; ")}.`;
}

/**
 * Diff already-compared forecast rows against the baseline and proposed windows.
 * Player totals are the forecast pool. Team totals are the forecast min/max teams.
 */
export function impactFromComparison(input: {
  baseline: ProposedConfig;
  proposed: ProposedConfig;
  targetSeasonYear: number;
  rows: readonly ForecastRow[];
  flows: readonly ForecastFlow[];
}): CutoffImpact {
  const labels = new Map(input.rows.map((row) => [row.code, row.label]));
  const divisions = input.rows
    .map((row) => divisionFromRow(row, input.baseline, input.proposed, input.targetSeasonYear))
    .filter(countsChanged)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  return {
    changed: divisions.length > 0,
    summary: summarize(input.baseline, input.proposed, input.targetSeasonYear, divisions, input.flows, labels),
    divisions,
  };
}

/** Run the forecast comparison, then keep only divisions whose players or teams change. */
export function buildCutoffImpact(input: {
  buckets: readonly BirthBucket[];
  baseline: ProposedConfig;
  proposed: ProposedConfig;
  targetSeasonYear: number;
  options?: Partial<ForecastOptions>;
}): CutoffImpact {
  const options = input.options ?? {};
  const compared = compareConfigs(input.buckets, input.baseline, input.proposed, input.targetSeasonYear, {
    retentionRate: options.retentionRate ?? DEFAULT_RETURN_RATE,
    includeFeeder: options.includeFeeder ?? false,
    ...(options.feederShare != null ? { feederShare: options.feederShare } : {}),
    rosterFor: options.rosterFor ?? (() => DEFAULT_ROSTER),
  });
  return impactFromComparison({
    baseline: input.baseline,
    proposed: input.proposed,
    targetSeasonYear: input.targetSeasonYear,
    rows: compared.rows,
    flows: compared.flows,
  });
}
