/**
 * Spring overlap mix. Historical registration shares split a shared birthdate
 * window. Fall forecast does not call this. No names, no database.
 */

import { effectiveCutoffDate, effectiveRange, eligibleDivisions } from "./compute";
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

function normalizeMixLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function matchScore(registration: string, division: DivisionAgeConfig): number {
  const reg = normalizeMixLabel(registration);
  if (!reg) return 0;
  const code = normalizeMixLabel(division.code);
  const label = normalizeMixLabel(division.label);
  if (reg === code || reg === label) return 100;
  const codeTail = code.replace(/^(gonzales|ascension)\s+/, "");
  if (codeTail && reg === codeTail) return 95;
  const strippedLabel = label.replace(/ (dyb|llb)$/, "");
  if (strippedLabel && strippedLabel !== label && reg === strippedLabel) return 95;
  if (codeTail && (reg.includes(codeTail) || codeTail.includes(reg)) && Math.min(reg.length, codeTail.length) >= 4) {
    return 80;
  }
  if (label && (reg.includes(label) || label.includes(reg)) && Math.min(reg.length, label.length) >= 4) {
    return 70;
  }
  return 0;
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

function inGroupWindow(
  birthDate: string,
  config: ForecastConfig,
  targetSeasonYear: number,
  codes: ReadonlySet<string>,
): boolean {
  return eligibleCodes(birthDate.trim(), config, targetSeasonYear).some((code) => codes.has(code));
}

/**
 * Historical Spring shares for each division in an overlap group.
 * Seasons are every prior Spring strictly before `targetSeasonYear`.
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
      const counts = new Map<string, number>();
      let total = 0;
      for (const player of season.players) {
        const count = playerCount(player);
        if (count === 0) continue;
        const code = matchDivision(player, members);
        if (!code) continue;
        seen.add(code);
        if (!inGroupWindow(player.birthDate, input.config, input.targetSeasonYear, codeSet)) continue;
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
