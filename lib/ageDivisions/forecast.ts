/**
 * Forecast math for next-season division headcount and team counts.
 * Pure and client-safe. Ages and eligibility come from `compute.ts`
 * (the same cutoff, year offset, and per-division date overrides the
 * Division Ages page uses).
 */

import {
  effectiveCutoffDate,
  effectiveRange,
  eligibleDivisions,
  leagueAge,
} from "./compute";
import type { DivisionAgeConfig, LeagueAgeRule, LeagueDivisionConfig } from "./types";

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
  /** `own + feeder`. A player in two divisions is counted in both. */
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
  /** `0 < expected < roster.min` on that side. */
  currentShortRoster: boolean;
  proposedShortRoster: boolean;
  /** Players in this division who are also eligible for another division. */
  currentOverlap: number;
  proposedOverlap: number;
};

export type ForecastPopulation = {
  distinctTotal: PoolSplit;
  tooYoung: PoolSplit;
  agedOut: PoolSplit;
  unmatched: PoolSplit;
};

export type CompareConfigsResult = {
  rows: ForecastRow[];
  /** Players whose eligible division-code set differs, counted once. */
  movers: number;
  current: ForecastPopulation;
  proposed: ForecastPopulation;
};

export type ForecastOptions = {
  /** Fraction in 0–1 applied to the whole pool. */
  retentionRate: number;
  includeFeeder: boolean;
  rosterFor: (divisionCode: string) => RosterSize;
};

/** Default team size until a season stores its own roster bounds. */
export const DEFAULT_ROSTER: RosterSize = Object.freeze({ min: 11, max: 12 });

/**
 * 2026 Spring→Fall carryover, rounded, for when a live rate cannot be
 * computed. Gonzales 0.29, Ascension 0.44. No other org is listed.
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

/** Apply one retention rate to the own pool, optionally plus the feeder pool. */
export function projectDivision(
  counts: { own: number; feeder: number },
  options: { retentionRate: number; includeFeeder: boolean },
): Projection {
  assertRetention(options.retentionRate);
  if (!Number.isFinite(counts.own) || !Number.isFinite(counts.feeder)) {
    throw new RangeError("Division headcount must be finite.");
  }
  const pool = counts.own + (options.includeFeeder ? counts.feeder : 0);
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
  const own = row?.own ?? 0;
  const feeder = row?.feeder ?? 0;
  const projected = projectDivision({ own, feeder }, options);
  const teams = teamCountRange(projected.expected, roster);
  return {
    side: {
      own,
      feeder,
      pool: projected.pool,
      expected: projected.expected,
      minTeams: teams.minTeams,
      maxTeams: teams.maxTeams,
    },
    shortRoster: teams.shortRoster,
    overlap: row?.overlap ?? 0,
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
  for (const code of meta.keys()) moversByCode.set(code, 0);
  let movers = 0;

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
    }
  }

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
        currentShortRoster: currentBuilt.shortRoster,
        proposedShortRoster: proposedBuilt.shortRoster,
        currentOverlap: currentBuilt.overlap,
        proposedOverlap: proposedBuilt.overlap,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  return {
    rows,
    movers,
    current: populationOf(currentAssignment),
    proposed: populationOf(proposedAssignment),
  };
}

/**
 * Spring→Fall carryover. Null when the spring distinct count is 0
 * (no rate to compute). Otherwise `carriedToFall / springDistinct`.
 */
export function carryoverRate(springDistinct: number, carriedToFall: number): number | null {
  if (!Number.isFinite(springDistinct) || !Number.isFinite(carriedToFall)) return null;
  if (springDistinct === 0) return null;
  return carriedToFall / springDistinct;
}
