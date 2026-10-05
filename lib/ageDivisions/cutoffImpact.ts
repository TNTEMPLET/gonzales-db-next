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
  type ForecastSide,
  type SharedPool,
} from "./forecast";
import { formatTimelineDate } from "./forecastTimeline";
import { formatDeltaTeams, type ProposedConfig } from "./forecastView";

export type ShiftedSlice = {
  oldest: string;
  youngest: string;
};

export type DivisionImpact = {
  /** Division code, or the forecast pool key when `shared` is true. */
  code: string;
  label: string;
  sortOrder: number;
  /** True when this card is one shared pool, not one division. */
  shared: boolean;
  /** Member division codes. A division card lists only itself. */
  codes: string[];
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
  /**
   * Birthdate intervals this card actually covers. Set for a shared pool so a
   * side where the pool has not formed yet still shows its member windows.
   * A division card leaves these unset and uses `beforeWindow` / `afterWindow`.
   */
  beforeCoverage?: ShiftedSlice[];
  afterCoverage?: ShiftedSlice[];
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

function coverageLabel(slices: readonly ShiftedSlice[] | undefined, fallback: ShiftedSlice): string {
  const list = slices ?? (fallback.oldest && fallback.youngest && fallback.oldest <= fallback.youngest ? [fallback] : []);
  return list.map(formatShiftedSlice).filter(Boolean).join(" and ");
}

export function formatWindowShift(division: DivisionImpact): string {
  const before = coverageLabel(division.beforeCoverage, division.beforeWindow);
  const after = coverageLabel(division.afterCoverage, division.afterWindow);
  const parts: string[] = [];
  if (before || after) parts.push(`Was ${before || "outside every division"}. Now ${after || "outside every division"}.`);
  const left = division.leftDivision.map(formatShiftedSlice).filter(Boolean);
  const entered = division.enteredDivision.map(formatShiftedSlice).filter(Boolean);
  const place = division.shared ? "pool" : "division";
  if (left.length > 0) parts.push(`Left this ${place}: ${left.join("; ")}.`);
  if (entered.length > 0) parts.push(`Entered this ${place}: ${entered.join("; ")}.`);
  return parts.join(" ");
}

function emptySide(): Pick<ForecastSide, "pool" | "expected" | "minTeams" | "maxTeams"> {
  return { pool: 0, expected: 0, minTeams: 0, maxTeams: 0 };
}

function withCounts(
  card: Omit<
    DivisionImpact,
    | "beforePlayers"
    | "afterPlayers"
    | "playerDelta"
    | "beforeExpected"
    | "afterExpected"
    | "beforeMinTeams"
    | "beforeMaxTeams"
    | "afterMinTeams"
    | "afterMaxTeams"
    | "minTeamDelta"
    | "maxTeamDelta"
  >,
  before: Pick<ForecastSide, "pool" | "expected" | "minTeams" | "maxTeams">,
  after: Pick<ForecastSide, "pool" | "expected" | "minTeams" | "maxTeams">,
): DivisionImpact {
  return {
    ...card,
    beforePlayers: before.pool,
    afterPlayers: after.pool,
    playerDelta: after.pool - before.pool,
    beforeExpected: before.expected,
    afterExpected: after.expected,
    beforeMinTeams: before.minTeams,
    beforeMaxTeams: before.maxTeams,
    afterMinTeams: after.minTeams,
    afterMaxTeams: after.maxTeams,
    minTeamDelta: after.minTeams - before.minTeams,
    maxTeamDelta: after.maxTeams - before.maxTeams,
  };
}

function divisionFromRow(
  row: ForecastRow,
  baseline: ProposedConfig,
  proposed: ProposedConfig,
  targetSeasonYear: number,
): DivisionImpact {
  const beforeWindow = windowFor(baseline, row.code, targetSeasonYear);
  const afterWindow = windowFor(proposed, row.code, targetSeasonYear);
  // A side that belongs to a shared pool is counted on that pool's card.
  const before = row.currentSharedPoolId ? emptySide() : row.current;
  const after = row.proposedSharedPoolId ? emptySide() : row.proposed;
  return withCounts(
    {
      code: row.code,
      label: row.label,
      sortOrder: row.sortOrder,
      shared: false,
      codes: [row.code],
      beforeWindow,
      afterWindow,
      leftDivision: windowDifference(beforeWindow, afterWindow),
      enteredDivision: windowDifference(afterWindow, beforeWindow),
    },
    before,
    after,
  );
}

function usableWindow(window: ShiftedSlice): boolean {
  return Boolean(window.oldest && window.youngest && window.oldest <= window.youngest);
}

function unionWindow(windows: readonly ShiftedSlice[]): ShiftedSlice {
  const usable = windows.filter(usableWindow);
  const first = usable[0];
  if (!first) return emptyWindow();
  return {
    oldest: usable.reduce((oldest, window) => (window.oldest < oldest ? window.oldest : oldest), first.oldest),
    youngest: usable.reduce((youngest, window) => (window.youngest > youngest ? window.youngest : youngest), first.youngest),
  };
}

/** Merge overlapping or touching birthdate intervals. A gap stays a gap. */
function mergeWindows(windows: readonly ShiftedSlice[]): ShiftedSlice[] {
  const sorted = windows.filter(usableWindow).sort((left, right) => left.oldest.localeCompare(right.oldest) || left.youngest.localeCompare(right.youngest));
  const merged: ShiftedSlice[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    const touches = last ? window.oldest <= addDays(last.youngest, 1) : false;
    if (!last || !touches) {
      merged.push({ oldest: window.oldest, youngest: window.youngest });
      continue;
    }
    if (window.youngest > last.youngest) last.youngest = window.youngest;
  }
  return merged;
}

/** Dates covered by `source` and not by `other`. */
function subtractWindows(source: readonly ShiftedSlice[], other: readonly ShiftedSlice[]): ShiftedSlice[] {
  let rest = mergeWindows(source);
  for (const cut of mergeWindows(other)) {
    const next: ShiftedSlice[] = [];
    for (const span of rest) {
      if (span.youngest < cut.oldest || span.oldest > cut.youngest) {
        next.push(span);
        continue;
      }
      if (span.oldest < cut.oldest) {
        const end = addDays(cut.oldest, -1);
        if (end && span.oldest <= end) next.push({ oldest: span.oldest, youngest: end });
      }
      if (span.youngest > cut.youngest) {
        const start = addDays(cut.youngest, 1);
        if (start && start <= span.youngest) next.push({ oldest: start, youngest: span.youngest });
      }
    }
    rest = next;
  }
  return rest;
}

/** Member windows on this side, including a side where those divisions do not share a pool yet. */
function memberCoverage(config: ProposedConfig, codes: readonly string[], targetSeasonYear: number): ShiftedSlice[] {
  return mergeWindows(codes.map((code) => windowFor(config, code, targetSeasonYear)));
}

/** One card for the pool. Member labels stay in alphabetical order, for example "6U Major + 6U Minor (shared pool)". */
function poolCardLabel(pool: SharedPool, rows: readonly ForecastRow[]): string {
  const labels = new Map(rows.map((row) => [row.code, row.label]));
  const names = [...pool.codes].map((code) => labels.get(code) ?? code).sort((left, right) => left.localeCompare(right));
  return `${names.join(" + ")} (shared pool)`;
}

function poolFromShared(
  pool: SharedPool,
  rows: readonly ForecastRow[],
  baseline: ProposedConfig,
  proposed: ProposedConfig,
  targetSeasonYear: number,
): DivisionImpact {
  const beforeCoverage = memberCoverage(baseline, pool.codes, targetSeasonYear);
  const afterCoverage = memberCoverage(proposed, pool.codes, targetSeasonYear);
  const sortOrders = pool.codes.map((code) => rows.find((row) => row.code === code)?.sortOrder ?? Number.POSITIVE_INFINITY);
  return withCounts(
    {
      code: pool.poolKey,
      label: poolCardLabel(pool, rows),
      sortOrder: Math.min(...sortOrders),
      shared: true,
      codes: [...pool.codes],
      beforeWindow: unionWindow(beforeCoverage),
      afterWindow: unionWindow(afterCoverage),
      beforeCoverage,
      afterCoverage,
      leftDivision: subtractWindows(beforeCoverage, afterCoverage),
      enteredDivision: subtractWindows(afterCoverage, beforeCoverage),
    },
    pool.current ?? emptySide(),
    pool.proposed ?? emptySide(),
  );
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

/** A flow whose from/to set is a shared pool, or a card for one. */
function poolMembershipFlow(flow: ForecastFlow, from: DivisionImpact | undefined, to: DivisionImpact | undefined): boolean {
  return Boolean(from?.shared || to?.shared || flow.from.includes("+") || flow.to.includes("+"));
}

function transferCount(flow: ForecastFlow, from: DivisionImpact | undefined, to: DivisionImpact | undefined): number {
  // Card deltas recount players who stayed in a member division when a pool forms or splits.
  // The forecast flow is only the birthdates whose division assignment changed.
  if (poolMembershipFlow(flow, from, to)) return flow.total;
  if (from && to && -from.playerDelta === to.playerDelta && to.playerDelta > 0) return to.playerDelta;
  return flow.total;
}

function flowSentence(
  flow: ForecastFlow,
  byCode: ReadonlyMap<string, DivisionImpact>,
  labels: ReadonlyMap<string, string>,
): string {
  const from = byCode.get(flow.from);
  const to = byCode.get(flow.to);
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
  /** Forecast shared pools. Members are one card, using the pool's own counts. */
  sharedPools?: readonly SharedPool[];
}): CutoffImpact {
  const labels = new Map(input.rows.map((row) => [row.code, row.label]));
  const sharedPools = input.sharedPools ?? [];
  const poolCards = sharedPools.map((pool) =>
    poolFromShared(pool, input.rows, input.baseline, input.proposed, input.targetSeasonYear),
  );
  const divisionCards = input.rows
    .filter((row) => !(row.currentSharedPoolId && row.proposedSharedPoolId))
    .map((row) => divisionFromRow(row, input.baseline, input.proposed, input.targetSeasonYear));
  const divisions = [...poolCards, ...divisionCards]
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
    sharedPools: compared.sharedPools,
  });
}
