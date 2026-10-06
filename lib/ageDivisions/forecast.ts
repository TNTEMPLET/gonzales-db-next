/**
 * Forecast math for next-season division headcount and team counts.
 * Pure and client-safe. Ages and eligibility come from `compute.ts`
 * (the same cutoff, year offset, and per-division date overrides the
 * Division Ages page uses).
 */

import {
  calculatedRange,
  coverageWarnings,
  effectiveCutoffDate,
  effectiveRange,
  eligibleDivisions,
  leagueAge,
} from "./compute";
import {
  configSpansBothLeagues,
  crossLeagueBandKey,
  crossLeagueShares,
  divisionMixShares,
  leaguePrefix,
  mergeLeagueMix,
  overlappingDivisionGroups,
  spansBothLeagues,
  type CrossLeagueShare,
  type DivisionMix,
  type LeagueMix,
  type MixSeason,
} from "./forecastMix";
import type { CoverageWarning, DivisionAgeConfig, LeagueAgeRule, LeagueDivisionConfig } from "./types";

export type { CrossLeagueShare, DivisionMix, LeagueMix, MixHistoryPlayer, MixSeason } from "./forecastMix";
export { EVEN_SPLIT_LEAGUE_MIX_NOTE, EVEN_SPLIT_MIX_NOTE, crossLeagueShares, divisionMixShares } from "./forecastMix";

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
  /**
   * Spring mix for the current window. Absent when mix weighting is off
   * (Fall, or a caller that did not pass history). Null when this division
   * does not overlap another.
   */
  currentMix?: DivisionMix | null;
  /** Spring mix for the proposed window. Same absence rules as `currentMix`. */
  proposedMix?: DivisionMix | null;
  /**
   * Combined Spring only. Share of this row's cross-league age band assigned
   * to its league (DYB or LLB). Null when the row's players fit only one
   * league. Absent when league apportionment is off (single-league, Fall).
   */
  currentLeagueMix?: LeagueMix | null;
  /** Proposed-window league share. Same absence rules as `currentLeagueMix`. */
  proposedLeagueMix?: LeagueMix | null;
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
  /**
   * Prior Spring registration mix. Omit it to keep every division at a 100%
   * share (Fall, and any caller that has not loaded history).
   * Seasons are completed Springs before the target season.
   */
  mix?: { seasons: readonly MixSeason[] };
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

type RemainderPart = { key: string; share: number; sortOrder: number };

/**
 * Split `total` into integers that sum to `total`. Each part gets
 * floor(total × share); leftover seats go to the largest fractional
 * remainders. Ties break toward the larger share, then the earlier
 * sort order, then the key. A 1-child even split is 1 and 0, not 1 and 1.
 */
function largestRemainder(total: number, parts: readonly RemainderPart[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const part of parts) result.set(part.key, 0);
  if (!Number.isInteger(total) || total <= 0 || parts.length === 0) return result;
  const shareSum = parts.reduce((sum, part) => sum + (Number.isFinite(part.share) ? part.share : 0), 0);
  const ranked = parts.map((part) => {
    const weight = shareSum > 0 ? part.share / shareSum : 1 / parts.length;
    const exact = total * weight;
    const nearest = Math.round(exact);
    const whole = Math.abs(exact - nearest) < 1e-6;
    const base = whole ? nearest : Math.floor(exact);
    return { ...part, base, frac: whole ? 0 : exact - base };
  });
  let left = total - ranked.reduce((sum, part) => sum + part.base, 0);
  ranked.sort((leftPart, rightPart) => {
    if (rightPart.frac !== leftPart.frac) return rightPart.frac - leftPart.frac;
    if (rightPart.share !== leftPart.share) return rightPart.share - leftPart.share;
    if (leftPart.sortOrder !== rightPart.sortOrder) return leftPart.sortOrder - rightPart.sortOrder;
    return leftPart.key.localeCompare(rightPart.key);
  });
  for (const part of ranked) result.set(part.key, part.base);
  if (left > 0) {
    let index = 0;
    while (left > 0) {
      const part = ranked[index % ranked.length]!;
      result.set(part.key, (result.get(part.key) ?? 0) + 1);
      left -= 1;
      index += 1;
    }
  } else {
    let index = ranked.length - 1;
    while (left < 0 && ranked.length > 0) {
      const part = ranked[(index + ranked.length) % ranked.length]!;
      const current = result.get(part.key) ?? 0;
      if (current > 0) {
        result.set(part.key, current - 1);
        left += 1;
      }
      index -= 1;
      if (index < -ranked.length * (total + 1)) break;
    }
  }
  return result;
}

function nearlyInteger(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value - Math.round(value)) < 1e-6;
}

function sideFromWindowShare(
  counts: { own: number; feeder: number },
  share: number,
  options: ForecastOptions,
  roster: RosterSize,
): { side: ForecastSide; shortRoster: boolean } {
  const ownCount = nearlyInteger(counts.own) ? Math.round(counts.own) : counts.own;
  const feederCount = nearlyInteger(counts.feeder) ? Math.round(counts.feeder) : counts.feeder;
  const windowPool = ownCount + appliedFeeder(feederCount, options);
  const pool = Math.round(windowPool * share);
  const expected = Math.round(windowPool * options.retentionRate * share);
  const teams = teamCountRange(expected, roster);
  const own = windowPool === 0 ? 0 : Math.round(pool * (ownCount / windowPool));
  const feeder = pool - own;
  return {
    side: {
      own,
      feeder,
      pool,
      expected,
      minTeams: teams.minTeams,
      maxTeams: teams.maxTeams,
    },
    shortRoster: teams.shortRoster,
  };
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

type LeagueApportionment = {
  shares: Map<string, CrossLeagueShare>;
  /** Eligible codes for each birth date under this config. */
  eligible: Map<string, string[]>;
  notes: Map<string, LeagueMix>;
};

function cachedEligible(
  cache: Map<string, string[]>,
  birthDate: string,
  config: ForecastConfig,
  targetSeasonYear: number,
): string[] {
  const hit = cache.get(birthDate);
  if (hit) return hit;
  const codes = eligibleCodes(birthDate, config, targetSeasonYear);
  cache.set(birthDate, codes);
  return codes;
}

/**
 * Combined Spring only. Kids who fit both a Gonzales row and an Ascension
 * row are split by the prior Spring league share for that age band. The
 * within-league mix then splits each league's portion. Single-league tables
 * and any forecast that did not pass mix history return null.
 */
function leagueApportionment(
  buckets: readonly BirthBucket[],
  config: ForecastConfig,
  targetSeasonYear: number,
  mixSeasons: readonly MixSeason[] | undefined,
): LeagueApportionment | null {
  if (!mixSeasons || !configSpansBothLeagues(config)) return null;
  const eligible = new Map<string, string[]>();
  const bands: string[][] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    if (bucket.count === 0) continue;
    const codes = cachedEligible(eligible, bucket.birthDate.trim(), config, targetSeasonYear);
    if (!spansBothLeagues(codes)) continue;
    const key = crossLeagueBandKey(codes);
    if (seen.has(key)) continue;
    seen.add(key);
    bands.push(codes);
  }
  const shares = crossLeagueShares({ config, targetSeasonYear, seasons: mixSeasons, bands });
  const playersByCode = new Map<string, { mix: LeagueMix; players: number }[]>();
  for (const bucket of buckets) {
    if (bucket.count === 0) continue;
    const codes = eligible.get(bucket.birthDate.trim());
    if (!codes || !spansBothLeagues(codes)) continue;
    const share = shares.get(crossLeagueBandKey(codes));
    if (!share) continue;
    for (const code of codes) {
      const league = leaguePrefix(code);
      if (!league) continue;
      const list = playersByCode.get(code) ?? [];
      list.push({ mix: share[league], players: bucket.count });
      playersByCode.set(code, list);
    }
  }
  const notes = new Map<string, LeagueMix>();
  for (const [code, parts] of playersByCode) {
    const league = leaguePrefix(code);
    if (!league) continue;
    const note = mergeLeagueMix(league, parts);
    if (note) notes.set(code, note);
  }
  return { shares, eligible, notes };
}

type ApportionedCounts = {
  counts: Map<string, { own: number; feeder: number }>;
  /** Within-league even-split rows whose league portion is 0. The league note stands alone. */
  hideMix: Set<string>;
};

/**
 * Integer row counts for combined Spring. Each birthdate band is split
 * into league portions with {@link largestRemainder}, then each portion
 * is split again by the within-league mix. Sibling rows sum to the
 * integer headcount. Single-league forecasts do not call this.
 */
function allocateApportionedCounts(
  buckets: readonly BirthBucket[],
  config: ForecastConfig,
  targetSeasonYear: number,
  mix: Map<string, DivisionMix> | null,
  groups: readonly (readonly string[])[],
  league: LeagueApportionment,
): ApportionedCounts {
  const counts = new Map<string, { own: number; feeder: number }>();
  const groupByCode = new Map<string, readonly string[]>();
  for (const group of groups) {
    for (const code of group) groupByCode.set(code, group);
  }
  const sortOrder = new Map(config.divisions.map((division) => [division.code, division.sortOrder]));
  const groupRaw = new Map<string, number>();
  const groupGiven = new Map<string, number>();
  const groupMembers = new Map<string, readonly string[]>();

  const add = (code: string, pool: BirthBucket["pool"], amount: number) => {
    if (amount <= 0) return;
    const current = counts.get(code) ?? { own: 0, feeder: 0 };
    current[pool] += amount;
    counts.set(code, current);
  };
  const rememberGroup = (group: readonly string[], raw: number, given: number) => {
    if (group.length < 2) return;
    const id = [...group].join("\0");
    groupMembers.set(id, group);
    groupRaw.set(id, (groupRaw.get(id) ?? 0) + raw);
    groupGiven.set(id, (groupGiven.get(id) ?? 0) + given);
  };
  const distribute = (codesInLeague: readonly string[], portion: number, raw: number, pool: BirthBucket["pool"]) => {
    if (codesInLeague.length === 0) return;
    let group: readonly string[] | null = null;
    for (const code of codesInLeague) {
      const found = groupByCode.get(code);
      if (found) {
        group = found;
        break;
      }
    }
    if (!group) {
      rememberGroup(codesInLeague, raw, portion);
      if (portion <= 0) return;
      if (codesInLeague.length === 1) {
        add(codesInLeague[0]!, pool, portion);
        return;
      }
      for (const code of codesInLeague) add(code, pool, portion);
      return;
    }
    rememberGroup(group, raw, portion);
    if (portion <= 0) return;
    const parts = largestRemainder(
      portion,
      group.map((code) => ({
        key: code,
        share: mix?.get(code)?.share ?? 1 / group.length,
        sortOrder: sortOrder.get(code) ?? 0,
      })),
    );
    for (const [code, amount] of parts) add(code, pool, amount);
  };

  for (const bucket of buckets) {
    if (bucket.count === 0) continue;
    const matched = cachedEligible(league.eligible, bucket.birthDate.trim(), config, targetSeasonYear);
    if (matched.length === 0) continue;
    if (!spansBothLeagues(matched)) {
      distribute(matched, bucket.count, bucket.count, bucket.pool);
      continue;
    }
    const band = league.shares.get(crossLeagueBandKey(matched));
    const split = largestRemainder(bucket.count, [
      { key: "gonzales", share: band?.gonzales.share ?? 0.5, sortOrder: 0 },
      { key: "ascension", share: band?.ascension.share ?? 0.5, sortOrder: 1 },
    ]);
    for (const leagueId of ["gonzales", "ascension"] as const) {
      const codes = matched.filter((code) => leaguePrefix(code) === leagueId);
      distribute(codes, split.get(leagueId) ?? 0, bucket.count, bucket.pool);
    }
  }

  const hideMix = new Set<string>();
  for (const [id, raw] of groupRaw) {
    if (raw <= 0 || (groupGiven.get(id) ?? 0) > 0) continue;
    for (const code of groupMembers.get(id) ?? []) {
      if (mix?.get(code)?.evenSplit) hideMix.add(code);
    }
  }
  return { counts, hideMix };
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
  fill(current, overlappingDivisionGroups(current, targetSeasonYear), "current", currentIds);
  fill(proposed, overlappingDivisionGroups(proposed, targetSeasonYear), "proposed", proposedIds);
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
  const mixSeasons = options.mix?.seasons;
  const currentMix = mixSeasons ? divisionMixShares({ config: current, targetSeasonYear, seasons: mixSeasons }) : null;
  const proposedMix = mixSeasons ? divisionMixShares({ config: proposed, targetSeasonYear, seasons: mixSeasons }) : null;
  // Shared pools above stay cross-league. Within-league mix stays inside one league.
  // Combined Spring then splits a child who fits both leagues by the prior Spring league share.
  const currentGroups = mixSeasons
    ? overlappingDivisionGroups(current, targetSeasonYear, { sameLeague: true })
    : [];
  const proposedGroups = mixSeasons
    ? overlappingDivisionGroups(proposed, targetSeasonYear, { sameLeague: true })
    : [];
  const currentLeague = leagueApportionment(buckets, current, targetSeasonYear, mixSeasons);
  const proposedLeague = leagueApportionment(buckets, proposed, targetSeasonYear, mixSeasons);
  const currentAlloc = currentLeague
    ? allocateApportionedCounts(buckets, current, targetSeasonYear, currentMix, currentGroups, currentLeague)
    : null;
  const proposedAlloc = proposedLeague
    ? allocateApportionedCounts(buckets, proposed, targetSeasonYear, proposedMix, proposedGroups, proposedLeague)
    : null;
  const weightedSide = (
    assignment: BucketAssignment,
    config: ForecastConfig,
    groups: string[][],
    mix: Map<string, DivisionMix> | null,
    alloc: ApportionedCounts | null,
    code: string,
    present: boolean,
    roster: RosterSize,
  ): BuiltSide => {
    if (!present) return { side: emptySide(), shortRoster: false, overlap: 0 };
    const row = assignment.divisions.find((division) => division.code === code);
    const overlap = row?.overlap ?? 0;
    if (alloc) {
      const built = sideFromCounts(alloc.counts.get(code) ?? { own: 0, feeder: 0 }, options, roster);
      return { ...built, overlap };
    }
    const weight = mix?.get(code);
    if (!weight) {
      const built = buildSide(assignment, code, true, options, roster);
      return { ...built, overlap };
    }
    const group = groups.find((codes) => codes.includes(code)) ?? [code];
    const counts = eligibleHeadcount(buckets, config, targetSeasonYear, new Set(group));
    const built = sideFromWindowShare(counts, weight.share, options, roster);
    return { ...built, overlap };
  };
  const rows = [...meta.entries()]
    .map(([code, row]) => {
      const roster = options.rosterFor(code);
      const currentBuilt = weightedSide(
        currentAssignment,
        current,
        currentGroups,
        currentMix,
        currentAlloc,
        code,
        row.inCurrent,
        roster,
      );
      const proposedBuilt = weightedSide(
        proposedAssignment,
        proposed,
        proposedGroups,
        proposedMix,
        proposedAlloc,
        code,
        row.inProposed,
        roster,
      );
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
        ...(mixSeasons
          ? {
              currentMix: currentAlloc?.hideMix.has(code) ? null : (currentMix?.get(code) ?? null),
              proposedMix: proposedAlloc?.hideMix.has(code) ? null : (proposedMix?.get(code) ?? null),
            }
          : {}),
        ...(currentLeague || proposedLeague
          ? {
              currentLeagueMix: currentLeague?.notes.get(code) ?? null,
              proposedLeagueMix: proposedLeague?.notes.get(code) ?? null,
            }
          : {}),
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
 * Each league starts from `calculatedRange` for that league's cutoff. A
 * birthdate override is the same day offset from the season cutoff's
 * calculated edge, applied to both leagues. Unedited edges stay calculated,
 * so the season's own column matches the timeline and the other league does
 * not copy the absolute date. Counts are raw headcount, before the return
 * rate and feeder share.
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
  return Boolean(oldest && youngest && oldest <= youngest && birthDate >= oldest && birthDate <= youngest);
}

function shiftDays(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match || !Number.isFinite(days)) return "";
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  utc.setUTCDate(utc.getUTCDate() + Math.trunc(days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daySpan(start: string, end: string): number {
  const from = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  const to = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
  if (!from || !to) return 0;
  const fromMs = Date.UTC(Number(from[1]), Number(from[2]) - 1, Number(from[3]));
  const toMs = Date.UTC(Number(to[1]), Number(to[2]) - 1, Number(to[3]));
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * One league's birthdate window. Overrides are day offsets from the season
 * cutoff, not absolute dates, so Little League and DYB stay apart. An edge
 * that would pass the other edge stops on it.
 */
function leagueBirthWindow(
  division: DivisionAgeConfig,
  leagueCutoffIso: string,
  seasonCutoffIso: string | null,
): { oldest: string; youngest: string } {
  const league = calculatedRange(division, leagueCutoffIso);
  let oldest = league.oldest;
  let youngest = league.youngest;
  if (seasonCutoffIso && (division.oldestBirthdate || division.youngestBirthdate)) {
    const season = calculatedRange(division, seasonCutoffIso);
    if (division.oldestBirthdate && season.oldest && league.oldest) {
      oldest = shiftDays(league.oldest, daySpan(season.oldest, division.oldestBirthdate));
    }
    if (division.youngestBirthdate && season.youngest && league.youngest) {
      youngest = shiftDays(league.youngest, daySpan(season.youngest, division.youngestBirthdate));
    }
  }
  if (oldest && youngest && oldest > youngest) {
    if (division.oldestBirthdate && !division.youngestBirthdate) oldest = youngest;
    else youngest = oldest;
  }
  return { oldest, youngest };
}

/** LL vs DYB counts for each division's age span. Duplicate codes keep the first division. */
export function eligibilityContrasts(
  buckets: readonly BirthBucket[],
  divisions: readonly DivisionAgeConfig[],
  targetSeasonYear: number,
  seasonRule?: LeagueAgeRule,
): EligibilityContrast[] {
  const llCutoff = effectiveCutoffDate(LITTLE_LEAGUE_RULE, targetSeasonYear);
  const dybCutoff = effectiveCutoffDate(DYB_RULE, targetSeasonYear);
  const seasonCutoff = seasonRule ? effectiveCutoffDate(seasonRule, targetSeasonYear) : null;
  const rows: EligibilityContrast[] = [];
  const seen = new Set<string>();
  const ordered = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  for (const division of ordered) {
    if (seen.has(division.code)) continue;
    seen.add(division.code);
    const llWindow = leagueBirthWindow(division, llCutoff, seasonCutoff);
    const dybWindow = leagueBirthWindow(division, dybCutoff, seasonCutoff);
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
  rules?: { current: LeagueAgeRule; proposed: LeagueAgeRule },
): EligibilityContrast[] {
  const byCode = new Map<string, { division: DivisionAgeConfig; rule?: LeagueAgeRule }>();
  for (const division of current) {
    if (!byCode.has(division.code)) byCode.set(division.code, { division, rule: rules?.current });
  }
  for (const division of proposed) byCode.set(division.code, { division, rule: rules?.proposed });
  const rows: EligibilityContrast[] = [];
  const seen = new Set<string>();
  const ordered = [...byCode.values()].sort(
    (a, b) => a.division.sortOrder - b.division.sortOrder || a.division.code.localeCompare(b.division.code),
  );
  for (const item of ordered) {
    if (seen.has(item.division.code)) continue;
    seen.add(item.division.code);
    rows.push(
      ...eligibilityContrasts(buckets, [item.division], targetSeasonYear, item.rule),
    );
  }
  return rows;
}

export function carryoverRate(springDistinct: number, carriedToFall: number): number | null {
  if (!Number.isFinite(springDistinct) || !Number.isFinite(carriedToFall)) return null;
  if (springDistinct === 0) return null;
  return carriedToFall / springDistinct;
}
