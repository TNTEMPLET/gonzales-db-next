/**
 * Forecast math for next-season division headcount and team counts.
 * Pure and client-safe. Ages and eligibility come from `compute.ts`
 * (the same cutoff, year offset, and per-division date overrides the
 * Division Ages page uses).
 */

import {
  coverageWarnings,
  effectiveCutoffDate,
  effectiveRange,
  eligibleDivisions,
  leagueAge,
} from "./compute";
import type { CoverageWarning, DivisionAgeConfig, LeagueAgeRule, LeagueDivisionConfig } from "./types";

/** Aug 31 age cutoff. Year offset is applied by the caller via the target season year. */
export const LITTLE_LEAGUE_RULE: LeagueAgeRule = { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 };

/** Apr 30 age cutoff. Year offset is applied by the caller via the target season year. */
export const DYB_RULE: LeagueAgeRule = { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 };

/** Aggregate players sharing a birth date. No names. */
export type BirthBucket = {
  birthDate: string;
  count: number;
  pool: "own" | "feeder";
};

/** One season's cutoff rule and division windows, including M4 date overrides. */
export type ForecastConfig = {
  cutoff: LeagueAgeRule;
  divisions: DivisionAgeConfig[];
};

/** Inclusive roster bounds for one team. */
export type RosterSize = {
  min: number;
  max: number;
};

/** Headcount split by pool. `total` is `own + feeder`. */
export type PoolSplit = {
  own: number;
  feeder: number;
  total: number;
};

export type DivisionAssignment = {
  code: string;
  label: string;
  sortOrder: number;
  own: number;
  feeder: number;
  /** `own + feeder` eligible for this division. League totals count a shared player once. */
  total: number;
  /** Players in this division who are also eligible for another division. */
  overlap: number;
};

export type BucketAssignment = {
  divisions: DivisionAssignment[];
  /** Players eligible for at least one division, counted once. */
  distinctTotal: PoolSplit;
  /** Younger than every division's effective window. */
  tooYoung: PoolSplit;
  /** Older than every division's effective window. */
  agedOut: PoolSplit;
  /** Unparseable dates, or dates that fall in a gap between divisions. */
  unmatched: PoolSplit;
};

export type Projection = {
  /** Own, plus feeder when the feeder pool is included. */
  pool: number;
  /** `round(pool × retentionRate)`. */
  expected: number;
};

export type TeamCountRange = {
  /** Fewest teams with no roster over `roster.max`. */
  minTeams: number;
  /** Most teams with no roster under `roster.min`. */
  maxTeams: number;
  /** `expected / minTeams`, or 0 when there are no teams. */
  avgAtMin: number;
  /** `expected / maxTeams`, or 0 when there are no teams. */
  avgAtMax: number;
  /** True when `0 < expected < roster.min` (one team, short of the minimum). */
  shortRoster: boolean;
};

export type ForecastSide = {
  own: number;
  feeder: number;
  pool: number;
  expected: number;
  minTeams: number;
  maxTeams: number;
};

export type ForecastRow = {
  code: string;
  label: string;
  sortOrder: number;
  inCurrent: boolean;
  inProposed: boolean;
  current: ForecastSide;
  proposed: ForecastSide;
  /** Proposed minus current, field by field. */
  delta: ForecastSide;
  /**
   * Players whose membership in this division changes between the configs
   * (in exactly one of the two division sets).
   */
  movers: number;
  /** Players who enter this division. Raw counts, before the return rate and feeder share. */
  moversIn: PoolSplit;
  /** Players who leave this division. Raw counts, before the return rate and feeder share. */
  moversOut: PoolSplit;
  /** `0 < expected < roster.min` on that side. */
  currentShortRoster: boolean;
  proposedShortRoster: boolean;
  /** Players in this division who are also eligible for another division. */
  currentOverlap: number;
  proposedOverlap: number;
  /** Set when this division's current window overlaps another division. */
  currentSharedPoolId: string | null;
  /** Set when this division's proposed window overlaps another division. */
  proposedSharedPoolId: string | null;
};

/** Divisions whose age windows overlap. Headcount and teams are for the pool once. */
export type SharedPool = {
  poolKey: string;
  codes: string[];
  label: string;
  current: ForecastSide | null;
  proposed: ForecastSide | null;
  currentShortRoster: boolean;
  proposedShortRoster: boolean;
};

/** League headcount and team range with each player counted once. */
export type LeagueTotals = {
  current: ForecastSide;
  proposed: ForecastSide;
  delta: ForecastSide;
};

export type ForecastPopulation = {
  distinctTotal: PoolSplit;
  tooYoung: PoolSplit;
  agedOut: PoolSplit;
  unmatched: PoolSplit;
};

/**
 * Players who move from one eligible set to another.
 * `from` and `to` are the sorted division codes joined with `+`, or
 * `none:tooYoung` | `none:agedOut` | `none:gap` when no division matches.
 */
export type ForecastFlow = {
  from: string;
  to: string;
  own: number;
  feeder: number;
  total: number;
};

export type CompareConfigsResult = {
  rows: ForecastRow[];
  /** Overlapping divisions. Totals use each pool once instead of summing its members. */
  sharedPools: SharedPool[];
  /** Current and proposed league totals. Shared-pool members are not summed. */
  league: LeagueTotals;
  /** Players whose eligible division-code set differs, counted once. */
  movers: number;
  /** One entry per from → to among movers. Totals sum to `movers`. */
  flows: ForecastFlow[];
  currentWarnings: CoverageWarning[];
  proposedWarnings: CoverageWarning[];
  current: ForecastPopulation;
  proposed: ForecastPopulation;
};

export type ForecastOptions = {
  /** Year-to-year return rate, fraction in 0–1. Default product value is 1 (100%). */
  retentionRate: number;
  includeFeeder: boolean;
  /**
   * Fraction in 0–1 of the feeder headcount added per division.
   * Omitted means {@link DEFAULT_FEEDER_SHARE} (10%).
   */
  feederShare?: number;
  rosterFor: (divisionCode: string) => RosterSize;
};

/** Default team size until a season stores its own roster bounds. */
export const DEFAULT_ROSTER: RosterSize = Object.freeze({ min: 11, max: 12 });

/** Return rate used when a league has not saved one. 1 means every player returns. */
export const DEFAULT_RETURN_RATE = 1;

/** Feeder share used when a league has not saved one. */
export const DEFAULT_FEEDER_SHARE = 0.1;

/**
 * Observed 2026 Spring→Fall carryover, rounded. Gonzales 0.29, Ascension 0.44.
 * Reference text only. Forecast math does not multiply by these rates.
 */
export const FALLBACK_RETENTION = Object.freeze({
  gonzales: 0.29,
  ascension: 0.44,
});

function emptySplit(): PoolSplit {
  return { own: 0, feeder: 0, total: 0 };
}

function addSplit(split: PoolSplit, pool: BirthBucket["pool"], count: number): void {
  split[pool] += count;
  split.total += count;
}

function populationOf(assignment: BucketAssignment): ForecastPopulation {
  return {
    distinctTotal: assignment.distinctTotal,
    tooYoung: assignment.tooYoung,
    agedOut: assignment.agedOut,
    unmatched: assignment.unmatched,
  };
}

function asLeague(config: ForecastConfig): LeagueDivisionConfig {
  return { rule: config.cutoff, divisions: config.divisions };
}

function assertPool(pool: string): asserts pool is BirthBucket["pool"] {
  if (pool !== "own" && pool !== "feeder") {
    throw new RangeError(`Birth bucket pool must be "own" or "feeder" (got ${pool}).`);
  }
}

function assertCount(count: number): void {
  if (!Number.isFinite(count) || count < 0) {
    throw new RangeError(`Birth bucket count must be a finite number ≥ 0 (got ${count}).`);
  }
}

function placementKey(
  birthDate: string,
  codes: readonly string[],
  config: ForecastConfig,
  targetSeasonYear: number,
): string {
  if (codes.length > 0) return [...codes].sort((a, b) => a.localeCompare(b)).join("+");
  const cutoff = effectiveCutoffDate(config.cutoff, targetSeasonYear);
  const bounds = coveredBounds(config, targetSeasonYear);
  const age = leagueAge(birthDate, cutoff);
  if (!Number.isFinite(age) || bounds == null) return "none:gap";
  if (birthDate < bounds.oldest) return "none:agedOut";
  if (birthDate > bounds.youngest) return "none:tooYoung";
  return "none:gap";
}

function eligibleCodes(birthDate: string, config: ForecastConfig, targetSeasonYear: number): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const division of eligibleDivisions(birthDate, asLeague(config), targetSeasonYear)) {
    if (seen.has(division.code)) continue;
    seen.add(division.code);
    codes.push(division.code);
  }
  return codes;
}

function coveredBounds(config: ForecastConfig, targetSeasonYear: number): { oldest: string; youngest: string } | null {
  const cutoff = effectiveCutoffDate(config.cutoff, targetSeasonYear);
  let oldest: string | null = null;
  let youngest: string | null = null;
  for (const division of config.divisions) {
    const range = effectiveRange(division, cutoff);
    if (!range.oldest || !range.youngest || range.oldest > range.youngest) continue;
    if (oldest == null || range.oldest < oldest) oldest = range.oldest;
    if (youngest == null || range.youngest > youngest) youngest = range.youngest;
  }
  if (oldest == null || youngest == null) return null;
  return { oldest, youngest };
}

/**
 * Place each birth-date bucket into every division it is eligible for in
 * `targetSeasonYear`. Overlapping windows count the same players in each
 * division and report that on `overlap`. `distinctTotal` counts them once.
 */
export function assignBuckets(
  buckets: readonly BirthBucket[],
  config: ForecastConfig,
  targetSeasonYear: number,
): BucketAssignment {
  const cutoff = effectiveCutoffDate(config.cutoff, targetSeasonYear);
  const bounds = coveredBounds(config, targetSeasonYear);
  const ordered = [...config.divisions].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  const byCode = new Map<string, DivisionAssignment>();
  for (const division of ordered) {
    if (byCode.has(division.code)) continue;
    byCode.set(division.code, {
      code: division.code,
      label: division.label,
      sortOrder: division.sortOrder,
      own: 0,
      feeder: 0,
      total: 0,
      overlap: 0,
    });
  }

  const distinctTotal = emptySplit();
  const tooYoung = emptySplit();
  const agedOut = emptySplit();
  const unmatched = emptySplit();

  for (const bucket of buckets) {
    assertPool(bucket.pool);
    assertCount(bucket.count);
    if (bucket.count === 0) continue;

    const birthDate = bucket.birthDate.trim();
    const codes = eligibleCodes(birthDate, config, targetSeasonYear);
    if (codes.length > 0) {
      addSplit(distinctTotal, bucket.pool, bucket.count);
      const overlaps = codes.length > 1;
      for (const code of codes) {
        const row = byCode.get(code);
        if (!row) continue;
        row[bucket.pool] += bucket.count;
        row.total += bucket.count;
        if (overlaps) row.overlap += bucket.count;
      }
      continue;
    }

    const age = leagueAge(birthDate, cutoff);
    if (!Number.isFinite(age) || bounds == null) {
      addSplit(unmatched, bucket.pool, bucket.count);
    } else if (birthDate < bounds.oldest) {
      addSplit(agedOut, bucket.pool, bucket.count);
    } else if (birthDate > bounds.youngest) {
      addSplit(tooYoung, bucket.pool, bucket.count);
    } else {
      addSplit(unmatched, bucket.pool, bucket.count);
    }
  }

  return {
    divisions: [...byCode.values()],
    distinctTotal,
    tooYoung,
    agedOut,
    unmatched,
  };
}

function assertRetention(retentionRate: number): void {
  if (!Number.isFinite(retentionRate) || retentionRate < 0 || retentionRate > 1) {
    throw new RangeError(`retentionRate must be between 0 and 1 (got ${retentionRate}).`);
  }
}

function assertShare(feederShare: number): void {
  if (!Number.isFinite(feederShare) || feederShare < 0 || feederShare > 1) {
    throw new RangeError(`feederShare must be between 0 and 1 (got ${feederShare}).`);
  }
}

function shareOf(options: { feederShare?: number }): number {
  const share = options.feederShare ?? DEFAULT_FEEDER_SHARE;
  assertShare(share);
  return share;
}

/** Feeder players added after the share. The toggle off contributes 0. Rounded to the nearest player. */
export function appliedFeeder(
  feeder: number,
  options: { includeFeeder: boolean; feederShare?: number },
): number {
  if (!Number.isFinite(feeder) || feeder < 0) {
    throw new RangeError("Division headcount must be finite.");
  }
  if (!options.includeFeeder) return 0;
  return Math.round(feeder * shareOf(options));
}

/** Apply the return rate to the own pool plus the feeder share. */
export function projectDivision(
  counts: { own: number; feeder: number },
  options: { retentionRate: number; includeFeeder: boolean; feederShare?: number },
): Projection {
  assertRetention(options.retentionRate);
  if (!Number.isFinite(counts.own) || !Number.isFinite(counts.feeder)) {
    throw new RangeError("Division headcount must be finite.");
  }
  const pool = counts.own + appliedFeeder(counts.feeder, options);
  return {
    pool,
    expected: Math.round(pool * options.retentionRate),
  };
}

function assertRoster(roster: RosterSize): void {
  const { min, max } = roster;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max || max > 30) {
    throw new RangeError(`Roster size must satisfy 1 ≤ min ≤ max ≤ 30 (got min=${min}, max=${max}).`);
  }
}

/**
 * Team-count range for an expected headcount.
 * `minTeams` is the fewest teams that stay at or under `roster.max`.
 * `maxTeams` is the most teams that stay at or above `roster.min`.
 * Zero players is 0/0. A non-zero headcount below `roster.min` is one short team.
 */
export function teamCountRange(expected: number, roster: RosterSize): TeamCountRange {
  assertRoster(roster);
  if (!Number.isFinite(expected) || expected < 0) {
    throw new RangeError(`Expected headcount must be a finite number ≥ 0 (got ${expected}).`);
  }
  if (expected === 0) {
    return { minTeams: 0, maxTeams: 0, avgAtMin: 0, avgAtMax: 0, shortRoster: false };
  }
  const minTeams = Math.ceil(expected / roster.max);
  const maxTeams = Math.max(minTeams, Math.floor(expected / roster.min));
  return {
    minTeams,
    maxTeams,
    avgAtMin: expected / minTeams,
    avgAtMax: expected / maxTeams,
    shortRoster: expected < roster.min,
  };
}

function emptySide(): ForecastSide {
  return { own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 };
}

type BuiltSide = {
  side: ForecastSide;
  shortRoster: boolean;
  overlap: number;
};

function buildSide(
  assignment: BucketAssignment,
  code: string,
  present: boolean,
  options: ForecastOptions,
  roster: RosterSize,
): BuiltSide {
  if (!present) return { side: emptySide(), shortRoster: false, overlap: 0 };
  const row = assignment.divisions.find((division) => division.code === code);
  const built = sideFromCounts({ own: row?.own ?? 0, feeder: row?.feeder ?? 0 }, options, roster);
  return { ...built, overlap: row?.overlap ?? 0 };
}

function sideFromCounts(
  counts: { own: number; feeder: number },
  options: ForecastOptions,
  roster: RosterSize,
): { side: ForecastSide; shortRoster: boolean } {
  const projected = projectDivision(counts, options);
  const teams = teamCountRange(projected.expected, roster);
  return {
    side: {
      own: counts.own,
      feeder: appliedFeeder(counts.feeder, options),
      pool: projected.pool,
      expected: projected.expected,
      minTeams: teams.minTeams,
      maxTeams: teams.maxTeams,
    },
    shortRoster: teams.shortRoster,
  };
}

function addSide(left: ForecastSide, right: ForecastSide): ForecastSide {
  return {
    own: left.own + right.own,
    feeder: left.feeder + right.feeder,
    pool: left.pool + right.pool,
    expected: left.expected + right.expected,
    minTeams: left.minTeams + right.minTeams,
    maxTeams: left.maxTeams + right.maxTeams,
  };
}

function subtractSide(proposed: ForecastSide, current: ForecastSide): ForecastSide {
  return {
    own: proposed.own - current.own,
    feeder: proposed.feeder - current.feeder,
    pool: proposed.pool - current.pool,
    expected: proposed.expected - current.expected,
    minTeams: proposed.minTeams - current.minTeams,
    maxTeams: proposed.maxTeams - current.maxTeams,
  };
}

function sameCodeSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const other = new Set(right);
  return left.every((code) => other.has(code));
}

type RowMeta = {
  label: string;
  sortOrder: number;
  inCurrent: boolean;
  inProposed: boolean;
};

function rangesOverlap(
  left: { oldest: string; youngest: string },
  right: { oldest: string; youngest: string },
): boolean {
  if (!left.oldest || !left.youngest || !right.oldest || !right.youngest) return false;
  if (left.oldest > left.youngest || right.oldest > right.youngest) return false;
  return left.oldest <= right.youngest && right.oldest <= left.youngest;
}

/** Connected divisions whose effective birthdate windows intersect. */
function overlappingGroups(config: ForecastConfig, targetSeasonYear: number): string[][] {
  const cutoff = effectiveCutoffDate(config.cutoff, targetSeasonYear);
  const ordered: DivisionAgeConfig[] = [];
  const seen = new Set<string>();
  const divisions = [...config.divisions].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  for (const division of divisions) {
    if (seen.has(division.code)) continue;
    seen.add(division.code);
    ordered.push(division);
  }
  const parent = new Map<string, string>();
  const find = (code: string): string => {
    let root = code;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = code;
    while (cursor !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(b, a);
  };
  for (const division of ordered) parent.set(division.code, division.code);
  const ranges = new Map(ordered.map((division) => [division.code, effectiveRange(division, cutoff)]));
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const left = ranges.get(ordered[i]!.code)!;
      const right = ranges.get(ordered[j]!.code)!;
      if (rangesOverlap(left, right)) union(ordered[i]!.code, ordered[j]!.code);
    }
  }
  const groups = new Map<string, string[]>();
  for (const division of ordered) {
    const root = find(division.code);
    const list = groups.get(root);
    if (list) list.push(division.code);
    else groups.set(root, [division.code]);
  }
  return [...groups.values()].filter((codes) => codes.length > 1);
}

function eligibleHeadcount(
  buckets: readonly BirthBucket[],
  config: ForecastConfig,
  targetSeasonYear: number,
  codes: ReadonlySet<string>,
): { own: number; feeder: number } {
  let own = 0;
  let feeder = 0;
  for (const bucket of buckets) {
    if (bucket.count === 0) continue;
    const matched = eligibleCodes(bucket.birthDate.trim(), config, targetSeasonYear);
    if (!matched.some((code) => codes.has(code))) continue;
    if (bucket.pool === "own") own += bucket.count;
    else feeder += bucket.count;
  }
  return { own, feeder };
}

function collectPools(
  buckets: readonly BirthBucket[],
  current: ForecastConfig,
  proposed: ForecastConfig,
  targetSeasonYear: number,
  options: ForecastOptions,
  meta: Map<string, RowMeta>,
): { pools: SharedPool[]; currentIds: Map<string, string>; proposedIds: Map<string, string> } {
  const byId = new Map<string, SharedPool>();
  const currentIds = new Map<string, string>();
  const proposedIds = new Map<string, string>();
  const ensure = (codes: string[]): SharedPool => {
    const poolKey = [...codes].sort().join("+");
    const existing = byId.get(poolKey);
    if (existing) return existing;
    const created: SharedPool = {
      poolKey,
      codes,
      label: `Shared pool: ${codes.map((code) => meta.get(code)?.label ?? code).join(", ")}`,
      current: null,
      proposed: null,
      currentShortRoster: false,
      proposedShortRoster: false,
    };
    byId.set(poolKey, created);
    return created;
  };
  const fill = (
    config: ForecastConfig,
    groups: string[][],
    side: "current" | "proposed",
    ids: Map<string, string>,
  ) => {
    for (const codes of groups) {
      const pool = ensure(codes);
      for (const code of codes) ids.set(code, pool.poolKey);
      const ordered = [...codes].sort((left, right) => {
        const leftDivision = config.divisions.find((division) => division.code === left);
        const rightDivision = config.divisions.find((division) => division.code === right);
        return (leftDivision?.sortOrder ?? 0) - (rightDivision?.sortOrder ?? 0) || left.localeCompare(right);
      });
      const roster = options.rosterFor(ordered[0] ?? codes[0] ?? "");
      const counts = eligibleHeadcount(buckets, config, targetSeasonYear, new Set(codes));
      const built = sideFromCounts(counts, options, roster);
      if (side === "current") {
        pool.current = built.side;
        pool.currentShortRoster = built.shortRoster;
      } else {
        pool.proposed = built.side;
        pool.proposedShortRoster = built.shortRoster;
      }
    }
  };
  fill(current, overlappingGroups(current, targetSeasonYear), "current", currentIds);
  fill(proposed, overlappingGroups(proposed, targetSeasonYear), "proposed", proposedIds);
  return { pools: [...byId.values()], currentIds, proposedIds };
}

function leagueSide(rows: readonly ForecastRow[], pools: readonly SharedPool[], side: "current" | "proposed"): ForecastSide {
  const pooled = new Set<string>();
  for (const pool of pools) {
    if (pool[side] == null) continue;
    for (const code of pool.codes) pooled.add(code);
  }
  const presentKey = side === "current" ? "inCurrent" : "inProposed";
  let total = emptySide();
  for (const row of rows) {
    if (!row[presentKey] || pooled.has(row.code)) continue;
    total = addSide(total, row[side]);
  }
  for (const pool of pools) {
    const poolSide = pool[side];
    if (poolSide) total = addSide(total, poolSide);
  }
  return total;
}

/**
 * Side-by-side current vs proposed configs. Rows are the union of division
 * codes, ordered by `sortOrder` (current's order when the code is in both).
 * A code present on only one side contributes zeros on the other.
 */
export function compareConfigs(
  buckets: readonly BirthBucket[],
  current: ForecastConfig,
  proposed: ForecastConfig,
  targetSeasonYear: number,
  options: ForecastOptions,
): CompareConfigsResult {
  assertRetention(options.retentionRate);
  shareOf(options);
  const currentAssignment = assignBuckets(buckets, current, targetSeasonYear);
  const proposedAssignment = assignBuckets(buckets, proposed, targetSeasonYear);

  const meta = new Map<string, RowMeta>();
  for (const division of current.divisions) {
    if (meta.has(division.code)) continue;
    meta.set(division.code, {
      label: division.label,
      sortOrder: division.sortOrder,
      inCurrent: true,
      inProposed: false,
    });
  }
  for (const division of proposed.divisions) {
    const existing = meta.get(division.code);
    if (!existing) {
      meta.set(division.code, {
        label: division.label,
        sortOrder: division.sortOrder,
        inCurrent: false,
        inProposed: true,
      });
      continue;
    }
    existing.inProposed = true;
  }

  const moversByCode = new Map<string, number>();
  const moversInByCode = new Map<string, PoolSplit>();
  const moversOutByCode = new Map<string, PoolSplit>();
  for (const code of meta.keys()) {
    moversByCode.set(code, 0);
    moversInByCode.set(code, emptySplit());
    moversOutByCode.set(code, emptySplit());
  }
  let movers = 0;
  const flowMap = new Map<string, ForecastFlow>();

  for (const bucket of buckets) {
    assertPool(bucket.pool);
    assertCount(bucket.count);
    if (bucket.count === 0) continue;
    const birthDate = bucket.birthDate.trim();
    const currentCodes = eligibleCodes(birthDate, current, targetSeasonYear);
    const proposedCodes = eligibleCodes(birthDate, proposed, targetSeasonYear);
    if (sameCodeSet(currentCodes, proposedCodes)) continue;
    movers += bucket.count;
    const currentSet = new Set(currentCodes);
    const proposedSet = new Set(proposedCodes);
    const codes = new Set([...currentCodes, ...proposedCodes]);
    for (const code of codes) {
      if (currentSet.has(code) === proposedSet.has(code)) continue;
      moversByCode.set(code, (moversByCode.get(code) ?? 0) + bucket.count);
      const direction = currentSet.has(code) ? moversOutByCode : moversInByCode;
      const split = direction.get(code) ?? emptySplit();
      addSplit(split, bucket.pool, bucket.count);
      direction.set(code, split);
    }
    const from = placementKey(birthDate, currentCodes, current, targetSeasonYear);
    const to = placementKey(birthDate, proposedCodes, proposed, targetSeasonYear);
    if (from === to) continue;
    const flowKey = `${from}\0${to}`;
    const flow = flowMap.get(flowKey) ?? { from, to, ...emptySplit() };
    addSplit(flow, bucket.pool, bucket.count);
    flowMap.set(flowKey, flow);
  }
  const flows = [...flowMap.values()].sort(
    (a, b) => b.total - a.total || a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  );

  const { pools, currentIds, proposedIds } = collectPools(
    buckets,
    current,
    proposed,
    targetSeasonYear,
    options,
    meta,
  );
  const rows = [...meta.entries()]
    .map(([code, row]) => {
      const roster = options.rosterFor(code);
      const currentBuilt = buildSide(currentAssignment, code, row.inCurrent, options, roster);
      const proposedBuilt = buildSide(proposedAssignment, code, row.inProposed, options, roster);
      return {
        code,
        label: row.label,
        sortOrder: row.sortOrder,
        inCurrent: row.inCurrent,
        inProposed: row.inProposed,
        current: currentBuilt.side,
        proposed: proposedBuilt.side,
        delta: subtractSide(proposedBuilt.side, currentBuilt.side),
        movers: moversByCode.get(code) ?? 0,
        moversIn: moversInByCode.get(code) ?? emptySplit(),
        moversOut: moversOutByCode.get(code) ?? emptySplit(),
        currentShortRoster: currentBuilt.shortRoster,
        proposedShortRoster: proposedBuilt.shortRoster,
        currentOverlap: currentBuilt.overlap,
        proposedOverlap: proposedBuilt.overlap,
        currentSharedPoolId: currentIds.get(code) ?? null,
        proposedSharedPoolId: proposedIds.get(code) ?? null,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  const leagueCurrent = leagueSide(rows, pools, "current");
  const leagueProposed = leagueSide(rows, pools, "proposed");
  return {
    rows,
    sharedPools: pools,
    league: {
      current: leagueCurrent,
      proposed: leagueProposed,
      delta: subtractSide(leagueProposed, leagueCurrent),
    },
    movers,
    flows,
    currentWarnings: coverageWarnings(current.divisions, effectiveCutoffDate(current.cutoff, targetSeasonYear)),
    proposedWarnings: coverageWarnings(proposed.divisions, effectiveCutoffDate(proposed.cutoff, targetSeasonYear)),
    current: populationOf(currentAssignment),
    proposed: populationOf(proposedAssignment),
  };
}

/**
 * Spring→Fall carryover. Null when the spring distinct count is 0
 * (no rate to compute). Otherwise `carriedToFall / springDistinct`.
 */
export type EligibilitySide = {
  own: number;
  feeder: number;
};

/**
 * One division's span counted under both cutoff rules.
 * A plain age span uses the calculated window. Birthdate overrides, including
 * each half of a split, use the effective window so the halves do not repeat
 * the unsplit span. Counts are raw headcount, before the return rate and feeder share.
 */
export type EligibilityContrast = {
  code: string;
  label: string;
  sortOrder: number;
  minAge: number;
  maxAge: number;
  llOldest: string;
  llYoungest: string;
  dybOldest: string;
  dybYoungest: string;
  ll: EligibilitySide;
  dyb: EligibilitySide;
  both: EligibilitySide;
  llOnly: EligibilitySide;
  dybOnly: EligibilitySide;
};

function emptyEligibilitySide(): EligibilitySide {
  return { own: 0, feeder: 0 };
}

function addEligibility(side: EligibilitySide, pool: BirthBucket["pool"], count: number): void {
  side[pool] += count;
}

function inBirthWindow(birthDate: string, oldest: string, youngest: string): boolean {
  return Boolean(oldest && youngest && birthDate >= oldest && birthDate <= youngest);
}

/** LL vs DYB counts for each division's age span. Duplicate codes keep the first division. */
export function eligibilityContrasts(
  buckets: readonly BirthBucket[],
  divisions: readonly DivisionAgeConfig[],
  targetSeasonYear: number,
): EligibilityContrast[] {
  const llCutoff = effectiveCutoffDate(LITTLE_LEAGUE_RULE, targetSeasonYear);
  const dybCutoff = effectiveCutoffDate(DYB_RULE, targetSeasonYear);
  const rows: EligibilityContrast[] = [];
  const seen = new Set<string>();
  const ordered = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  for (const division of ordered) {
    if (seen.has(division.code)) continue;
    seen.add(division.code);
    const llWindow = effectiveRange(division, llCutoff);
    const dybWindow = effectiveRange(division, dybCutoff);
    const row: EligibilityContrast = {
      code: division.code,
      label: division.label,
      sortOrder: division.sortOrder,
      minAge: division.minAge,
      maxAge: division.maxAge,
      llOldest: llWindow.oldest,
      llYoungest: llWindow.youngest,
      dybOldest: dybWindow.oldest,
      dybYoungest: dybWindow.youngest,
      ll: emptyEligibilitySide(),
      dyb: emptyEligibilitySide(),
      both: emptyEligibilitySide(),
      llOnly: emptyEligibilitySide(),
      dybOnly: emptyEligibilitySide(),
    };
    for (const bucket of buckets) {
      if (bucket.count === 0) continue;
      assertPool(bucket.pool);
      assertCount(bucket.count);
      const birthDate = bucket.birthDate.trim();
      const inLl = inBirthWindow(birthDate, row.llOldest, row.llYoungest);
      const inDyb = inBirthWindow(birthDate, row.dybOldest, row.dybYoungest);
      if (inLl) addEligibility(row.ll, bucket.pool, bucket.count);
      if (inDyb) addEligibility(row.dyb, bucket.pool, bucket.count);
      if (inLl && inDyb) addEligibility(row.both, bucket.pool, bucket.count);
      else if (inLl) addEligibility(row.llOnly, bucket.pool, bucket.count);
      else if (inDyb) addEligibility(row.dybOnly, bucket.pool, bucket.count);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Eligibility for the current and proposed division lists. A code present in
 * both uses the proposed age span.
 */
export function eligibilityForConfigs(
  buckets: readonly BirthBucket[],
  current: readonly DivisionAgeConfig[],
  proposed: readonly DivisionAgeConfig[],
  targetSeasonYear: number,
): EligibilityContrast[] {
  const byCode = new Map<string, DivisionAgeConfig>();
  for (const division of current) {
    if (!byCode.has(division.code)) byCode.set(division.code, division);
  }
  for (const division of proposed) byCode.set(division.code, division);
  return eligibilityContrasts(buckets, [...byCode.values()], targetSeasonYear);
}

export function carryoverRate(springDistinct: number, carriedToFall: number): number | null {
  if (!Number.isFinite(springDistinct) || !Number.isFinite(carriedToFall)) return null;
  if (springDistinct === 0) return null;
  return carriedToFall / springDistinct;
}
