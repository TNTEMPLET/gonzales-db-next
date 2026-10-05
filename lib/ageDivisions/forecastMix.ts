/**
 * Spring overlap mix. Historical registration shares split a shared birthdate
 * window. Fall forecast does not call this. No names, no database.
 */

import { effectiveCutoffDate, effectiveRange, eligibleDivisions, shiftIsoDateByYears } from "./compute";
import type { DivisionAgeConfig } from "./types";
import type { ForecastConfig } from "./forecast";

/** Shown when an overlap group has no usable prior Spring mix. */
export const EVEN_SPLIT_MIX_NOTE = "No prior Spring mix; using even split";

/** One registration cohort. `count` defaults to 1. No player names. */
export type MixHistoryPlayer = {
  birthDate: string;
  /** Registered division label. Empty when the row only has an age group. */
  divisionName: string;
  /** Registered age group. Used when the division name does not match. */
  ageGroup: string;
  count?: number;
};

/** Completed Spring registrations for one season, already collapsed to counts. */
export type MixSeason = {
  seasonYear: number;
  players: readonly MixHistoryPlayer[];
};

/** Share of an overlap group's window assigned to one division. */
export type DivisionMix = {
  /** Fraction in 0–1. Group members sum to 1. */
  share: number;
  /** `Math.round(share × 100)` for display. */
  sharePercent: number;
  /** Prior seasons that had at least one in-window registration, ascending. */
  seasons: number[];
  /** True when the group used an even split instead of history. */
  evenSplit: boolean;
  /** UI copy. The even-split warning, or the share percent and season span. */
  note: string;
};

type LeagueShape = { rule: ForecastConfig["cutoff"]; divisions: DivisionAgeConfig[] };

function asLeague(config: ForecastConfig): LeagueShape {
  return { rule: config.cutoff, divisions: config.divisions };
}

/**
 * Collapse punctuation and SportsConnect noise so history labels line up with
 * Forecast division names. Keeps league tags (llb/dyb) for the alias table;
 * trailing tags are stripped again during scoring.
 */
function normalizeMixLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\blittle league\b/g, " ")
    .replace(/\byear olds?\b/g, " ")
    .replace(/\byr olds?\b/g, " ")
    .replace(/\bcoaches\b/g, "coach")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop a trailing LLB/DYB/DBB token (and optional charter noise). */
function stripLeagueTag(value: string): string {
  return value.replace(/\s+(llb|dyb|dbb)$/g, "").trim();
}

/**
 * SportsConnect Spring names (staging Ascension/Gonzales aggregates) that do
 * not fuzzy-match the built-in Forecast labels. Keys are {@link normalizeMixLabel}
 * forms; values are alternate labels/codes to score against.
 */
const SPORTSCONNECT_MIX_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // Gonzales DYB (Enrollment.divisionNameRaw / ageGroup on staging Spring 2026)
  "9 dyb": ["9u kid pitch", "9u kp"],
  "10 dyb": ["10u kid pitch", "10u kp"],
  "11 12 dyb": ["11 12u", "11 12"],
  "13 15 diamond boys baseball": ["13 14u", "13 14"],
  "13 14 diamond boys baseball": ["13 14u", "13 14"],
  "15 17 diamond boys pre majors": ["15 17u", "15 17"],
  "14u dyb": ["13 14u", "13 14"],
  "17u dyb": ["15 17u", "15 17"],
  // Tee-ball style names when the Forecast row uses the short Gonzales label
  "3 4u tee ball": ["3 4u tee ball", "3 4u tb"],
  "5u tee ball": ["5u tee ball", "5u tb"],
};

function aliasKeysFor(registration: string): string[] {
  const normalized = normalizeMixLabel(registration);
  if (!normalized) return [];
  const keys = new Set<string>([normalized, stripLeagueTag(normalized)]);
  for (const base of [...keys]) {
    for (const alias of SPORTSCONNECT_MIX_ALIASES[base] ?? []) {
      const a = normalizeMixLabel(alias);
      if (a) keys.add(a);
      const stripped = stripLeagueTag(a);
      if (stripped) keys.add(stripped);
    }
  }
  return [...keys].filter(Boolean);
}

function playerCount(player: MixHistoryPlayer): number {
  const count = player.count ?? 1;
  if (!Number.isFinite(count) || count <= 0) return 0;
  return count;
}

function registrationKeys(player: MixHistoryPlayer): string[] {
  const division = player.divisionName.trim();
  const ageGroup = player.ageGroup.trim();
  const keys: string[] = [];
  if (division) keys.push(division);
  if (ageGroup && normalizeMixLabel(ageGroup) !== normalizeMixLabel(division)) keys.push(ageGroup);
  return keys;
}

function scoreAgainst(reg: string, candidate: string): number {
  if (!reg || !candidate) return 0;
  if (reg === candidate) return 100;
  const strippedReg = stripLeagueTag(reg);
  const strippedCand = stripLeagueTag(candidate);
  if (strippedReg && strippedCand && strippedReg === strippedCand) return 95;
  if (strippedCand && reg === strippedCand) return 95;
  if (strippedReg && candidate === strippedReg) return 95;
  if (
    (reg.includes(candidate) || candidate.includes(reg)) &&
    Math.min(reg.length, candidate.length) >= 4
  ) {
    return 70;
  }
  if (
    strippedReg &&
    strippedCand &&
    (strippedReg.includes(strippedCand) || strippedCand.includes(strippedReg)) &&
    Math.min(strippedReg.length, strippedCand.length) >= 4
  ) {
    return 70;
  }
  return 0;
}

function matchScore(registration: string, division: DivisionAgeConfig): number {
  const regs = aliasKeysFor(registration);
  if (regs.length === 0) return 0;
  const code = normalizeMixLabel(division.code);
  const label = normalizeMixLabel(division.label);
  const codeTail = stripLeagueTag(code.replace(/^(gonzales|ascension)\s+/, ""));
  const candidates = [code, label, codeTail, stripLeagueTag(label)].filter(Boolean);
  let best = 0;
  for (const reg of regs) {
    for (const candidate of candidates) {
      const score = scoreAgainst(reg, candidate);
      if (score > best) best = score;
    }
  }
  return best;
}

/** One division in `candidates`, or null when nothing matches or two tie. */
function matchDivision(player: MixHistoryPlayer, candidates: readonly DivisionAgeConfig[]): string | null {
  for (const key of registrationKeys(player)) {
    let bestScore = 0;
    let best: string[] = [];
    for (const division of candidates) {
      const score = matchScore(key, division);
      if (score > bestScore) {
        bestScore = score;
        best = [division.code];
      } else if (score === bestScore && score > 0) {
        best.push(division.code);
      }
    }
    if (bestScore > 0 && best.length === 1) return best[0] ?? null;
  }
  return null;
}

/** Test helper: which division code a registration string maps to. */
export function matchMixRegistration(
  registration: string,
  candidates: readonly DivisionAgeConfig[],
): string | null {
  return matchDivision({ birthDate: "2015-06-01", divisionName: registration, ageGroup: "" }, candidates);
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

function rangesOverlap(
  left: { oldest: string; youngest: string },
  right: { oldest: string; youngest: string },
): boolean {
  if (!left.oldest || !left.youngest || !right.oldest || !right.youngest) return false;
  if (left.oldest > left.youngest || right.oldest > right.youngest) return false;
  return left.oldest <= right.youngest && right.oldest <= left.youngest;
}

/** Connected divisions whose effective birthdate windows intersect. */
export function overlappingDivisionGroups(config: ForecastConfig, targetSeasonYear: number): string[][] {
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

function priorSeasons(seasons: readonly MixSeason[], targetSeasonYear: number): MixSeason[] {
  const byYear = new Map<number, MixHistoryPlayer[]>();
  for (const season of seasons) {
    if (!Number.isInteger(season.seasonYear) || season.seasonYear >= targetSeasonYear || season.seasonYear < 1990) {
      continue;
    }
    const list = byYear.get(season.seasonYear) ?? [];
    list.push(...season.players);
    byYear.set(season.seasonYear, list);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seasonYear, players]) => ({ seasonYear, players }));
}

export function formatMixSeasonSpan(seasons: readonly number[]): string {
  const years = [...new Set(seasons)].filter((year) => Number.isInteger(year)).sort((a, b) => a - b);
  if (years.length === 0) return "";
  if (years.length === 1) return String(years[0]);
  const contiguous = years.every((year, index) => index === 0 || year === years[index - 1]! + 1);
  if (contiguous) return `${years[0]}\u2013${years[years.length - 1]}`;
  if (years.length === 2) return `${years[0]} and ${years[1]}`;
  return years.join(", ");
}

export function formatDivisionMixNote(share: number, seasons: readonly number[], evenSplit: boolean): string {
  if (evenSplit) return EVEN_SPLIT_MIX_NOTE;
  const percent = Math.round(share * 100);
  const span = formatMixSeasonSpan(seasons);
  if (seasons.length <= 1) return `${percent}% of window, Spring ${span}`;
  return `${percent}% of window, avg of Spring ${span}`;
}

function mixFor(code: string, share: number, seasons: readonly number[], evenSplit: boolean): DivisionMix {
  return {
    share,
    sharePercent: Math.round(share * 100),
    seasons: [...seasons],
    evenSplit,
    note: formatDivisionMixNote(share, seasons, evenSplit),
  };
}

function evenSplit(codes: readonly string[]): Map<string, DivisionMix> {
  const share = codes.length === 0 ? 0 : 1 / codes.length;
  const map = new Map<string, DivisionMix>();
  for (const code of codes) map.set(code, mixFor(code, share, [], true));
  return map;
}

function divisionsByCode(config: ForecastConfig): Map<string, DivisionAgeConfig> {
  const map = new Map<string, DivisionAgeConfig>();
  for (const division of config.divisions) {
    if (!map.has(division.code)) map.set(division.code, division);
  }
  return map;
}

/**
 * Copy of `config` with absolute birthdate overrides shifted into `historyYear`.
 * Age-derived edges already move with the season cutoff; overrides are stored
 * as calendar dates for the target season and must slide back by the same gap.
 */
function configForHistorySeason(
  config: ForecastConfig,
  targetSeasonYear: number,
  historySeasonYear: number,
): ForecastConfig {
  const deltaYears = historySeasonYear - targetSeasonYear;
  if (deltaYears === 0) return config;
  return {
    cutoff: config.cutoff,
    divisions: config.divisions.map((division) => {
      const next = { ...division };
      if (division.oldestBirthdate) {
        next.oldestBirthdate = shiftIsoDateByYears(division.oldestBirthdate, deltaYears);
      }
      if (division.youngestBirthdate) {
        next.youngestBirthdate = shiftIsoDateByYears(division.youngestBirthdate, deltaYears);
      }
      return next;
    }),
  };
}

function inGroupWindow(
  birthDate: string,
  config: ForecastConfig,
  seasonYear: number,
  codes: ReadonlySet<string>,
): boolean {
  return eligibleCodes(birthDate.trim(), config, seasonYear).some((code) => codes.has(code));
}

/**
 * Historical Spring shares for each division in an overlap group.
 * Seasons are every prior Spring strictly before `targetSeasonYear`.
 * For each prior season Y, players are tested against the overlap windows
 * as they existed in year Y (age windows shifted back by target−Y, including
 * any absolute birthdate overrides). That way an 8U Minor cohort from Spring
 * Y counts toward 8 Minor in the mix for a later target year, instead of
 * aging out of the target window.
 * Each season with at least one in-window registration has equal weight.
 * Shares are normalized to 100% inside the group.
 * A group with no in-window season even-splits every sibling and each row
 * uses {@link EVEN_SPLIT_MIX_NOTE}. A sibling that never appears in history
 * takes an even 1/n share and is the only row with that warning. Siblings
 * that do appear keep their historical ratio, scaled to fill the rest.
 * Divisions that do not overlap are omitted (their share stays 100%).
 */
export function divisionMixShares(input: {
  config: ForecastConfig;
  targetSeasonYear: number;
  seasons: readonly MixSeason[];
}): Map<string, DivisionMix> {
  const groups = overlappingDivisionGroups(input.config, input.targetSeasonYear);
  const result = new Map<string, DivisionMix>();
  if (groups.length === 0) return result;

  const seasons = priorSeasons(input.seasons, input.targetSeasonYear);
  const byCode = divisionsByCode(input.config);

  for (const codes of groups) {
    const members = codes
      .map((code) => byCode.get(code))
      .filter((division): division is DivisionAgeConfig => division != null);
    const codeSet = new Set(codes);
    const seen = new Set<string>();
    const seasonShares: { year: number; shares: Map<string, number> }[] = [];

    for (const season of seasons) {
      const historyConfig = configForHistorySeason(input.config, input.targetSeasonYear, season.seasonYear);
      const counts = new Map<string, number>();
      let total = 0;
      for (const player of season.players) {
        const count = playerCount(player);
        if (count === 0) continue;
        const code = matchDivision(player, members);
        if (!code) continue;
        seen.add(code);
        // Window for season Y, not the target year — keeps same-age cohorts aligned.
        if (!inGroupWindow(player.birthDate, historyConfig, season.seasonYear, codeSet)) continue;
        counts.set(code, (counts.get(code) ?? 0) + count);
        total += count;
      }
      if (total <= 0) continue;
      const shares = new Map<string, number>();
      for (const code of codes) shares.set(code, (counts.get(code) ?? 0) / total);
      seasonShares.push({ year: season.seasonYear, shares });
    }

    const appearing = codes.filter((code) => seen.has(code));
    const missing = codes.filter((code) => !seen.has(code));
    if (seasonShares.length === 0 || appearing.length === 0) {
      for (const [code, mix] of evenSplit(codes)) result.set(code, mix);
      continue;
    }

    const averaged = new Map<string, number>();
    for (const code of appearing) {
      let sum = 0;
      for (const season of seasonShares) sum += season.shares.get(code) ?? 0;
      averaged.set(code, sum / seasonShares.length);
    }
    let weight = 0;
    for (const value of averaged.values()) weight += value;
    const years = seasonShares.map((season) => season.year);
    if (!(weight > 0)) {
      for (const [code, mix] of evenSplit(codes)) result.set(code, mix);
      continue;
    }
    const historicalPortion = 1 - missing.length / codes.length;
    for (const code of appearing) {
      const share = historicalPortion * ((averaged.get(code) ?? 0) / weight);
      result.set(code, mixFor(code, share, years, false));
    }
    const missingShare = 1 / codes.length;
    for (const code of missing) result.set(code, mixFor(code, missingShare, [], true));
  }

  return result;
}
