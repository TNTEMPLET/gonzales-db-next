/**
 * Decide whether a Spring division-age save must stop for a second confirm.
 *
 * A division is removed when its saved code is absent after the split (the
 * review row whose After is "Removed"). A label or window edit that keeps
 * the code is not a removal.
 *
 * Counts are rows still stored on that division's saved label or code:
 * Enrollment.ageGroup, Enrollment.divisionNameRaw, Team.ageGroup, and
 * DraftSession.ageGroup. Matching is trimmed and case-insensitive, and is
 * limited to that league. This module does not read or write the database.
 * The save still writes SeasonOrgSettings.divisionAgesJson only.
 */

import type { DivisionAgeConfig } from "@/lib/ageDivisions/types";

import { removedCodesForCombinedSave, type SpringLeagueTable } from "./save";
import type { SpringLeagueOrg } from "./view";

const LEAGUE_TITLE: Record<SpringLeagueOrg, string> = {
  gonzales: "Gonzales DYB",
  ascension: "Ascension LL",
};

export type RemovedDivisionRef = {
  organizationId: SpringLeagueOrg;
  code: string;
  label: string;
};

export type RemovalImpact = RemovedDivisionRef & {
  registrations: number;
  teams: number;
  drafts: number;
};

export type RemovalLinkRows = {
  enrollments: readonly { ageGroup: string; divisionNameRaw?: string | null }[];
  teams: readonly { ageGroup: string }[];
  drafts: readonly { ageGroup: string }[];
};

/** `save` may PUT. `confirm` needs the second click. `check` must load counts first. */
export type RemovalSaveGate = "save" | "confirm" | "check";

export function removedDivisionRefs(
  current: readonly SpringLeagueTable[],
  proposed: { divisions: readonly DivisionAgeConfig[] },
): RemovedDivisionRef[] {
  const removed = removedCodesForCombinedSave(current, proposed);
  const refs: RemovedDivisionRef[] = [];
  for (const league of current) {
    const codes = new Set(removed[league.organizationId] ?? []);
    if (codes.size === 0) continue;
    for (const division of league.divisions) {
      if (!codes.has(division.code)) continue;
      refs.push({
        organizationId: league.organizationId,
        code: division.code,
        label: division.label,
      });
    }
  }
  return refs;
}

/** Saved label and code. Empty strings are not keys, so a blank field matches nothing. */
export function divisionMatchKeys(division: Pick<RemovedDivisionRef, "code" | "label">): string[] {
  const keys = new Set<string>();
  for (const raw of [division.label, division.code]) {
    const key = raw.trim().toLowerCase();
    if (key) keys.add(key);
  }
  return [...keys];
}

function matchesKey(value: string | null | undefined, keys: ReadonlySet<string>): boolean {
  if (!value) return false;
  return keys.has(value.trim().toLowerCase());
}

export function countRemovalLinks(
  division: Pick<RemovedDivisionRef, "code" | "label">,
  rows: RemovalLinkRows,
): Pick<RemovalImpact, "registrations" | "teams" | "drafts"> {
  const keys = new Set(divisionMatchKeys(division));
  let registrations = 0;
  for (const row of rows.enrollments) {
    if (matchesKey(row.ageGroup, keys) || matchesKey(row.divisionNameRaw, keys)) registrations += 1;
  }
  let teams = 0;
  for (const row of rows.teams) {
    if (matchesKey(row.ageGroup, keys)) teams += 1;
  }
  let drafts = 0;
  for (const row of rows.drafts) {
    if (matchesKey(row.ageGroup, keys)) drafts += 1;
  }
  return { registrations, teams, drafts };
}

export function tallyRemovalImpacts(
  divisions: readonly RemovedDivisionRef[],
  rowsByOrg: ReadonlyMap<string, RemovalLinkRows>,
): RemovalImpact[] {
  const empty: RemovalLinkRows = { enrollments: [], teams: [], drafts: [] };
  return divisions.map((division) => ({
    ...division,
    ...countRemovalLinks(division, rowsByOrg.get(division.organizationId) ?? empty),
  }));
}

export function linkedRemovalTotal(impact: Pick<RemovalImpact, "registrations" | "teams" | "drafts">): number {
  return impact.registrations + impact.teams + impact.drafts;
}

export function needsRemovalConfirm(impacts: readonly Pick<RemovalImpact, "registrations" | "teams" | "drafts">[]): boolean {
  return impacts.some((impact) => linkedRemovalTotal(impact) > 0);
}

function isWholeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function parseRemovalImpacts(value: unknown): RemovalImpact[] | null {
  if (!value || typeof value !== "object") return null;
  const divisions = (value as { divisions?: unknown }).divisions;
  if (!Array.isArray(divisions)) return null;
  const impacts: RemovalImpact[] = [];
  for (const row of divisions) {
    if (!row || typeof row !== "object") return null;
    const item = row as Record<string, unknown>;
    if (item.organizationId !== "gonzales" && item.organizationId !== "ascension") return null;
    if (typeof item.code !== "string" || typeof item.label !== "string") return null;
    if (!isWholeCount(item.registrations) || !isWholeCount(item.teams) || !isWholeCount(item.drafts)) return null;
    impacts.push({
      organizationId: item.organizationId,
      code: item.code,
      label: item.label,
      registrations: item.registrations,
      teams: item.teams,
      drafts: item.drafts,
    });
  }
  return impacts;
}

export function impactsCoverRemovals(
  removed: readonly RemovedDivisionRef[],
  impacts: readonly RemovalImpact[],
): boolean {
  if (impacts.length !== removed.length) return false;
  return removed.every((division, index) => {
    const impact = impacts[index];
    return (
      impact != null &&
      impact.organizationId === division.organizationId &&
      impact.code === division.code &&
      impact.label === division.label
    );
  });
}

/**
 * No removed divisions (including a rename that keeps the code) saves on the
 * first confirm. Removals with every count at 0 do too. Any linked row waits
 * for the second confirm. Missing or mismatched counts stay on `check`.
 */
export function removalSaveGate(input: {
  removed: readonly RemovedDivisionRef[];
  impacts: readonly RemovalImpact[] | null;
}): RemovalSaveGate {
  if (input.removed.length === 0) return "save";
  if (input.impacts == null || !impactsCoverRemovals(input.removed, input.impacts)) return "check";
  if (needsRemovalConfirm(input.impacts)) return "confirm";
  return "save";
}

function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinCounts(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function removalImpactSentence(impact: RemovalImpact, leagueTitle?: string): string {
  const parts: string[] = [];
  if (impact.registrations > 0) parts.push(countPhrase(impact.registrations, "registration", "registrations"));
  if (impact.teams > 0) parts.push(countPhrase(impact.teams, "team", "teams"));
  if (impact.drafts > 0) parts.push(countPhrase(impact.drafts, "draft", "drafts"));
  const name = impact.label.trim() || impact.code.trim();
  const titled = leagueTitle ? `${name} (${leagueTitle})` : name;
  return `Removing ${titled} would leave ${joinCounts(parts)} on that name.`;
}

/** Lines for divisions that still have rows. Zero-count removals are omitted. */
export function removalConfirmLines(impacts: readonly RemovalImpact[]): string[] {
  const linked = impacts.filter((impact) => linkedRemovalTotal(impact) > 0);
  const labelCounts = new Map<string, number>();
  for (const impact of linked) {
    const key = impact.label.trim().toLowerCase();
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }
  return linked.map((impact) => {
    const crowded = (labelCounts.get(impact.label.trim().toLowerCase()) ?? 0) > 1;
    return removalImpactSentence(impact, crowded ? LEAGUE_TITLE[impact.organizationId] : undefined);
  });
}
