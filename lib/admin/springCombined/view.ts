/**
 * Master-admin "Spring (combined)" view.
 *
 * `spring` is a view selector (`?org=spring`). It is not a ContentOrgId and
 * must never be stored as an organization id on a row. Scratch Division
 * Builder tables may use the same word as a browser-storage key only.
 */

import {
  BUILDER_STORAGE_VERSION,
  llMinorsDefaultPatch,
  newBuilderRow,
  type BuilderRow,
  type BuilderTable,
} from "@/lib/ageDivisions/divisionBuilder";
import { effectiveCutoffDate, effectiveRange } from "@/lib/ageDivisions/compute";
import { assignBuckets, type BirthBucket } from "@/lib/ageDivisions/forecast";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

export const SPRING_COMBINED_PARAM = "spring";

/** Browser-storage key only. Not a content org and not written to the database. */
export const SPRING_BUILDER_ORG = "spring";

export const SPRING_LEAGUE_ORGS = ["gonzales", "ascension"] as const;
export type SpringLeagueOrg = (typeof SPRING_LEAGUE_ORGS)[number];

export const SPRING_COMBINED_READONLY_ERROR = "Spring combined is a read-only view.";

export const SPRING_COMBINED_SAVE_HINT =
  "Save writes Gonzales DYB and Ascension LL together for this season. Review the before and after, then save. Undo last save restores both leagues";

const LEAGUE_SUFFIX: Record<SpringLeagueOrg, "DYB" | "LLB"> = {
  gonzales: "DYB",
  ascension: "LLB",
};

export function isSpringCombinedParam(value: string | null | undefined): boolean {
  return value === SPRING_COMBINED_PARAM;
}

export function isSpringLeagueOrg(value: string | null | undefined): value is SpringLeagueOrg {
  return value === "gonzales" || value === "ascension";
}

export function springLeagueSuffix(org: SpringLeagueOrg): "DYB" | "LLB" {
  return LEAGUE_SUFFIX[org];
}

/** Display name only. Does not rewrite a saved division name. */
export function leagueTaggedDivisionName(savedName: string, org: SpringLeagueOrg): string {
  const suffix = LEAGUE_SUFFIX[org];
  const name = savedName.trim();
  if (!name) return suffix;
  if (new RegExp(`(?:^|\\s)${suffix}$`, "i").test(name)) return name;
  return `${name} ${suffix}`;
}

export function springCombinedRequestBlock(
  requestedOrg: string | null | undefined,
): { status: 403; error: string } | null {
  if (!isSpringCombinedParam(requestedOrg)) return null;
  return { status: 403, error: SPRING_COMBINED_READONLY_ERROR };
}

export function canOfferSpringCombined(input: { isMaster: boolean; masterDeployment: boolean }): boolean {
  return input.isMaster && input.masterDeployment;
}

export function springLeaguesAreLive(liveOrgs: readonly string[]): boolean {
  return liveOrgs.some((org) => org === "gonzales" || org === "ascension");
}

/** Landing suggestion when the URL has no org and neither spring league is in season. */
export function suggestSpringCombined(input: {
  isMaster: boolean;
  masterDeployment: boolean;
  requestedOrg?: string | null;
  liveOrgs: readonly string[];
}): boolean {
  if (!canOfferSpringCombined(input)) return false;
  if (input.requestedOrg != null && input.requestedOrg !== "") return false;
  return !springLeaguesAreLive(input.liveOrgs);
}

export type SeasonSetupView = { mode: "denied" } | { mode: "combined" } | { mode: "single" };

export function resolveSeasonSetupView(input: {
  isMaster: boolean;
  masterDeployment: boolean;
  requestedOrg: string | null | undefined;
  liveOrgs: readonly string[];
}): SeasonSetupView {
  if (isSpringCombinedParam(input.requestedOrg)) {
    if (!canOfferSpringCombined(input)) return { mode: "denied" };
    return { mode: "combined" };
  }
  return { mode: "single" };
}

export type DivisionAgesView = "denied" | "combined" | "default";

/**
 * Master admins on the master site see one combined Spring table when the URL
 * has no org, or when it asks for `?org=spring`. `all`, one league, and Fall
 * Ball stay on the default screen. Non-masters never get the combined view.
 * The season-setup hub stays single unless `?org=spring` is explicit.
 */
export function resolveDivisionAgesView(input: {
  isMaster: boolean;
  masterDeployment: boolean;
  requestedOrg: string | null | undefined;
  liveOrgs?: readonly string[];
}): DivisionAgesView {
  if (isSpringCombinedParam(input.requestedOrg)) {
    if (!canOfferSpringCombined(input)) return "denied";
    return "combined";
  }
  const bare = input.requestedOrg == null || input.requestedOrg === "";
  if (bare && canOfferSpringCombined(input)) return "combined";
  return "default";
}

export type SpringRegistrationInput = {
  organizationId: string;
  sportsConnectRowKey: string;
  ageGroup: string;
};

export type SpringRegistrationSummary = {
  seasonYear: number;
  totalPlayers: number;
  duplicatePlayers: number;
  byLeague: Array<{ organizationId: SpringLeagueOrg; players: number }>;
  byDivision: Array<{
    organizationId: SpringLeagueOrg;
    ageGroup: string;
    displayName: string;
    players: number;
  }>;
};

type RegistrationAppearance = { organizationId: SpringLeagueOrg; ageGroup: string };

/** One division row for a player who is in both leagues. Gonzales wins ties. */
function registrationDivisionAppearance(appearances: readonly RegistrationAppearance[]): RegistrationAppearance {
  for (const org of SPRING_LEAGUE_ORGS) {
    const hit = appearances.find((appearance) => appearance.organizationId === org);
    if (hit) return hit;
  }
  return appearances[0]!;
}

/**
 * One player per sportsConnectRowKey. A key present in both spring leagues
 * counts once in the total and once in the division table, and is flagged.
 * League-only counts stay exclusive. Fall Ball rows are ignored. Blank keys
 * are not merged with each other.
 */
export function summarizeSpringRegistrations(
  rows: readonly SpringRegistrationInput[],
  seasonYear: number,
): SpringRegistrationSummary {
  const groups = new Map<string, RegistrationAppearance[]>();
  let blank = 0;
  for (const row of rows) {
    if (!isSpringLeagueOrg(row.organizationId)) continue;
    const key = row.sportsConnectRowKey.trim();
    const id = key || `blank-${blank++}`;
    const list = groups.get(id) ?? [];
    list.push({
      organizationId: row.organizationId,
      ageGroup: row.ageGroup.trim() || "Unassigned",
    });
    groups.set(id, list);
  }

  const exclusive: Record<SpringLeagueOrg, number> = { gonzales: 0, ascension: 0 };
  let duplicatePlayers = 0;
  const divisionCounts = new Map<
    string,
    { organizationId: SpringLeagueOrg; ageGroup: string; players: number }
  >();

  for (const appearances of groups.values()) {
    const orgs = new Set(appearances.map((appearance) => appearance.organizationId));
    if (orgs.size > 1) duplicatePlayers += 1;
    else exclusive[appearances[0]!.organizationId] += 1;
    const chosen = registrationDivisionAppearance(appearances);
    const divKey = `${chosen.organizationId}\0${chosen.ageGroup}`;
    const current = divisionCounts.get(divKey) ?? {
      organizationId: chosen.organizationId,
      ageGroup: chosen.ageGroup,
      players: 0,
    };
    current.players += 1;
    divisionCounts.set(divKey, current);
  }

  const byDivision = [...divisionCounts.values()]
    .map((row) => ({
      ...row,
      displayName: leagueTaggedDivisionName(row.ageGroup, row.organizationId),
    }))
    .sort((a, b) => {
      const age = a.ageGroup.localeCompare(b.ageGroup, undefined, { numeric: true });
      if (age !== 0) return age;
      return a.organizationId.localeCompare(b.organizationId);
    });

  return {
    seasonYear,
    totalPlayers: groups.size,
    duplicatePlayers,
    byLeague: SPRING_LEAGUE_ORGS.map((organizationId) => ({
      organizationId,
      players: exclusive[organizationId],
    })),
    byDivision,
  };
}

export type SpringPoolPlayer = {
  sportsConnectRowKey: string | null;
  matchKey: string | null;
  birthDate: string | null;
};

/**
 * Drop a second copy of the same player.
 * A shared sportsConnectRowKey always collapses. When a league has no row key
 * (roster fallback), the forecast match key is used instead. Two different
 * row keys stay separate even if the match key is the same.
 */
export function dedupeSpringPool(players: readonly SpringPoolPlayer[]): {
  players: SpringPoolPlayer[];
  duplicateCount: number;
} {
  const seenRow = new Set<string>();
  const rowMatch = new Set<string>();
  const openRosterMatch = new Set<string>();
  const unique: SpringPoolPlayer[] = [];
  let duplicateCount = 0;
  for (const player of players) {
    const rowKey = player.sportsConnectRowKey?.trim() ?? "";
    const match = player.matchKey?.trim() ?? "";
    if (rowKey) {
      if (seenRow.has(rowKey)) {
        duplicateCount += 1;
        continue;
      }
      if (match && openRosterMatch.has(match)) {
        openRosterMatch.delete(match);
        seenRow.add(rowKey);
        rowMatch.add(match);
        duplicateCount += 1;
        continue;
      }
      seenRow.add(rowKey);
      if (match) rowMatch.add(match);
      unique.push(player);
      continue;
    }
    if (match) {
      if (rowMatch.has(match) || openRosterMatch.has(match)) {
        duplicateCount += 1;
        continue;
      }
      openRosterMatch.add(match);
      unique.push(player);
      continue;
    }
    unique.push(player);
  }
  return { players: unique, duplicateCount };
}

export type SpringLeagueDivisions = {
  organizationId: SpringLeagueOrg;
  cutoff: LeagueAgeRule;
  divisions: readonly DivisionAgeConfig[];
};

export type TaggedDivisionRow = {
  organizationId: SpringLeagueOrg;
  code: string;
  savedName: string;
  displayName: string;
  minAge: number;
  maxAge: number;
  oldest: string;
  youngest: string;
};

/** One display table. Saved division objects are not renamed or mutated. */
export function taggedDivisionRows(leagues: readonly SpringLeagueDivisions[], seasonYear: number): TaggedDivisionRow[] {
  const rows: TaggedDivisionRow[] = [];
  for (const league of leagues) {
    if (!isSpringLeagueOrg(league.organizationId)) continue;
    const cutoff = effectiveCutoffDate(league.cutoff, seasonYear);
    for (const division of league.divisions) {
      const savedName = division.label.trim() || division.code;
      const range = effectiveRange(division, cutoff);
      rows.push({
        organizationId: league.organizationId,
        code: `${league.organizationId}:${division.code}`,
        savedName,
        displayName: leagueTaggedDivisionName(savedName, league.organizationId),
        minAge: division.minAge,
        maxAge: division.maxAge,
        oldest: range.oldest,
        youngest: range.youngest,
      });
    }
  }
  return rows;
}

export function combinedForecastConfig(
  leagues: readonly SpringLeagueDivisions[],
  seasonYear: number,
): { cutoff: LeagueAgeRule; divisions: DivisionAgeConfig[] } {
  const divisions: DivisionAgeConfig[] = [];
  for (const row of taggedDivisionRows(leagues, seasonYear)) {
    divisions.push({
      code: row.code,
      label: row.displayName,
      minAge: row.minAge,
      maxAge: row.maxAge,
      sortOrder: divisions.length + 1,
      ...(row.oldest ? { oldestBirthdate: row.oldest } : {}),
      ...(row.youngest ? { youngestBirthdate: row.youngest } : {}),
    });
  }
  return {
    cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
    divisions,
  };
}

/**
 * Return rate for the combined forecast. An edited percent wins. Otherwise
 * the count uses the same 100% default the box shows. This does not read or
 * change a per-league setting.
 */
export function combinedForecastRetention(
  override: number | undefined,
  fallback: number,
): { applied: number; source: "default" | "override" } {
  if (typeof override === "number" && Number.isFinite(override)) {
    return { applied: override, source: "override" };
  }
  return { applied: fallback, source: "default" };
}

/**
 * Saved league windows are the current side. A proposed config from the
 * editor is the other side. Omitting it compares the saved table with itself.
 */
export function springForecastComparison(
  leagues: readonly SpringLeagueDivisions[],
  seasonYear: number,
  proposed: { cutoff: LeagueAgeRule; divisions: DivisionAgeConfig[] } | null,
): {
  current: { cutoff: LeagueAgeRule; divisions: DivisionAgeConfig[] };
  proposed: { cutoff: LeagueAgeRule; divisions: DivisionAgeConfig[] };
} {
  const current = combinedForecastConfig(leagues, seasonYear);
  if (!proposed) return { current, proposed: current };
  return { current, proposed };
}

export type SpringCombinedCounts = {
  totalPlayers: number;
  datedPlayers: number;
  duplicatePlayers: number;
  rows: Array<{ code: string; label: string; count: number }>;
};

/** Assign the deduped pool with each division's own baked window. No feeder share. */
export function countSpringCombinedPool(
  players: readonly SpringPoolPlayer[],
  config: { cutoff: LeagueAgeRule; divisions: DivisionAgeConfig[] },
  seasonYear: number,
): SpringCombinedCounts {
  const deduped = dedupeSpringPool(players);
  const buckets = new Map<string, number>();
  let datedPlayers = 0;
  for (const player of deduped.players) {
    if (!player.birthDate) continue;
    datedPlayers += 1;
    buckets.set(player.birthDate, (buckets.get(player.birthDate) ?? 0) + 1);
  }
  const birthBuckets: BirthBucket[] = [...buckets.entries()].map(([birthDate, count]) => ({
    birthDate,
    count,
    pool: "own",
  }));
  const assigned = assignBuckets(birthBuckets, config, seasonYear);
  return {
    totalPlayers: deduped.players.length,
    datedPlayers,
    duplicatePlayers: deduped.duplicateCount,
    rows: assigned.divisions.map((division) => ({
      code: division.code,
      label: division.label,
      count: division.total,
    })),
  };
}

type TemplateSpec = {
  id: string;
  name: string;
  minAge: number;
  maxAge: number;
  charter: BuilderRow["charter"];
  cutoff: BuilderRow["cutoff"];
  customMonth?: number;
  customDay?: number;
  oldestOverride?: string;
  youngestOverride?: string;
};

/**
 * 7U and 8U Minors stay Little League charter with a custom cutoff. The month,
 * day, and oldest birthday come from `llMinorsDefaultPatch` so this template,
 * the builder table, and the wizard share one season-year mapping.
 */
function springTemplateSpecs(seasonYear: number): TemplateSpec[] {
  const seven = llMinorsDefaultPatch("7U", seasonYear);
  const eight = llMinorsDefaultPatch("8U", seasonYear);
  return [
    { id: "tee-llb", name: "Tee-ball LLB", minAge: 4, maxAge: 6, charter: "ll", cutoff: "dyb" },
    {
      id: "7u-minors-llb",
      name: "7U Minors LLB",
      minAge: seven.minAge,
      maxAge: seven.maxAge,
      charter: "ll",
      cutoff: seven.cutoff,
      customMonth: seven.customMonth,
      customDay: seven.customDay,
      oldestOverride: seven.oldestOverride,
      youngestOverride: seven.youngestOverride,
    },
    {
      id: "8u-minors-llb",
      name: "8U Minors LLB",
      minAge: eight.minAge,
      maxAge: eight.maxAge,
      charter: "ll",
      cutoff: eight.cutoff,
      customMonth: eight.customMonth,
      customDay: eight.customDay,
      oldestOverride: eight.oldestOverride,
      youngestOverride: eight.youngestOverride,
    },
    { id: "78-majors-llb", name: "7/8 Majors LLB", minAge: 7, maxAge: 8, charter: "ll", cutoff: "little-league" },
    { id: "9u-llb", name: "9U LLB", minAge: 9, maxAge: 9, charter: "ll", cutoff: "little-league" },
    { id: "9u-dyb", name: "9U DYB", minAge: 9, maxAge: 9, charter: "dyb", cutoff: "dyb" },
    { id: "10u-llb", name: "10U LLB", minAge: 10, maxAge: 10, charter: "ll", cutoff: "little-league" },
    { id: "10u-dyb", name: "10U DYB", minAge: 10, maxAge: 10, charter: "dyb", cutoff: "dyb" },
    { id: "11u-llb", name: "11U LLB", minAge: 11, maxAge: 11, charter: "ll", cutoff: "little-league" },
    { id: "11u-dyb", name: "11U DYB", minAge: 11, maxAge: 11, charter: "dyb", cutoff: "dyb" },
    { id: "12u-llb", name: "12U LLB", minAge: 12, maxAge: 12, charter: "ll", cutoff: "little-league" },
    { id: "12u-dyb", name: "12U DYB", minAge: 12, maxAge: 12, charter: "dyb", cutoff: "dyb" },
    { id: "1314-dyb", name: "13/14U DYB", minAge: 13, maxAge: 14, charter: "dyb", cutoff: "dyb" },
    { id: "1517-dyb", name: "15-17U DYB", minAge: 15, maxAge: 17, charter: "dyb", cutoff: "dyb" },
  ];
}

/** Scratch table only. organizationId is the browser-storage key, not a content org. */
export function springCombinedBuilderTable(seasonYear: number): BuilderTable {
  return {
    version: BUILDER_STORAGE_VERSION,
    organizationId: SPRING_BUILDER_ORG,
    seasonYear,
    rows: springTemplateSpecs(seasonYear).map((spec) =>
      newBuilderRow(spec.id, {
        name: spec.name,
        minAge: spec.minAge,
        maxAge: spec.maxAge,
        charter: spec.charter,
        cutoff: spec.cutoff,
        ...(spec.customMonth != null ? { customMonth: spec.customMonth } : {}),
        ...(spec.customDay != null ? { customDay: spec.customDay } : {}),
        ...(spec.oldestOverride != null ? { oldestOverride: spec.oldestOverride } : {}),
        ...(spec.youngestOverride != null ? { youngestOverride: spec.youngestOverride } : {}),
      }),
    ),
  };
}

export function springContentOrgsUnchanged(orgs: readonly ContentOrgId[]): boolean {
  return orgs.length === 3 && orgs[0] === "gonzales" && orgs[1] === "ascension" && orgs[2] === "fallball";
}

export function springParamIsNotContentOrg(): boolean {
  return isContentOrgId(SPRING_COMBINED_PARAM) === false;
}
