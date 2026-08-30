/**
 * Pure helpers for Teams admin import workflows (Phase 4a extraction).
 */

import { STANDARD_DIVISIONS as FALLBALL_STANDARD_DIVISIONS } from "@/lib/sportsConnect/fallballDivisions";

export const PLAYER_IMPORT_DIVISION_KEYS = [
  "Division Name",
  "Division",
  "Program Division",
  "Program Name",
  "Age Group",
  "age_group",
  "AGE_GROUP",
] as const;

export const PLAYER_IMPORT_TEAM_KEYS = [
  "Team Name",
  "Team",
  "Roster Team Name",
  "Assigned Team",
  "assigned_team",
  "ASSIGNED_TEAM",
] as const;

export const PLAYER_IMPORT_NAME_KEYS = [
  "Player Full Name",
  "Participant Name",
  "Player Name",
  "Child Name",
  "Registrant Name",
  "Full Name",
  "full_name",
] as const;

export const PLAYER_IMPORT_EMAIL_KEYS = [
  "User Email",
  "Account Email",
  "Parent Email",
  "Guardian Email",
  "Email",
  "email",
] as const;

export const PLAYER_IMPORT_STEPS = [
  "Upload",
  "Review mappings",
  "Preview changes",
  "Import",
  "Review results",
] as const;

export const COACH_IMPORT_STEPS = [
  "Upload",
  "Review age groups",
  "Preview coach/team matches",
  "Import",
  "Review results",
] as const;

export const TEAM_LIST_IMPORT_STEPS = [
  "Upload/Paste CSV",
  "Preview teams",
  "Import",
  "Results",
] as const;

export const BASEBALL_AGE_DIVISIONS = [
  "6U",
  "8U",
  "10U",
  "12U",
  "14U",
  "16U",
  "18U",
] as const;

export function getImportRowValue(
  row: Record<string, unknown>,
  keys: readonly string[],
) {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const parsed = String(value).trim();
    if (parsed) return parsed;
  }
  return "";
}

export function getImportProgressPercent(status: {
  totalRows: number;
  processedRows: number;
} | null) {
  if (!status) return 0;
  if (!status.totalRows || status.totalRows <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((status.processedRows / status.totalRows) * 100)),
  );
}

export function normalizeLooseName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SportsConnect export divisions are the source of truth for roster imports.
 * Only non-player program rows (umpire clinics / volunteer ump tracks) are
 * skipped — every real player division (including tee ball, 3-4/5 year-olds,
 * and Little League Tee Ball) must import as-is. A prior commit (b1eaa4a,
 * "tighten division omission logic") added skip rules for those real player
 * divisions, silently dropping registered players in the youngest age
 * groups from every import path (legacy + Smart Auto-Build) since
 * 2026-08-26 — reverted here. See docs/sports-connect-import.md's
 * "Skipped divisions (automatic)" section, which only ever documented
 * umpire-only rows as skipped.
 */
export function shouldSkipDivisionImport(divisionName: string) {
  const normalized = divisionName.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes("umpire");
}

export function buildTeamNameFromSponsor(
  sponsor: string,
  headCoachLastName: string,
) {
  const normalizedSponsor = sponsor.trim();
  const normalizedLastName = headCoachLastName.trim();
  if (!normalizedSponsor || !normalizedLastName) return "";
  return `${normalizedSponsor} - ${normalizedLastName}`;
}

export function toCsvSafeValue(value: string) {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export type TeamsOrgId = "gonzales" | "ascension" | "fallball";

export function getTeamsManagementAgeGroupDefaults(targetOrg: TeamsOrgId) {
  if (targetOrg === "fallball") {
    // The league's 10 standardized division codes (4U TB ... 17U) — the
    // same vocabulary lib/sportsConnect/fallballDivisions.ts matches import
    // text against, so a fresh team always lines up with what imports will
    // write to Team.ageGroup. Previously this was a placeholder "6U Fall"
    // .. "18U Fall" list that didn't correspond to any real division.
    return [...FALLBALL_STANDARD_DIVISIONS];
  }
  if (targetOrg === "ascension") {
    return BASEBALL_AGE_DIVISIONS.map((division) => `${division} LLB`);
  }
  return BASEBALL_AGE_DIVISIONS.map((division) => {
    const age = Number.parseInt(division, 10);
    const program = age <= 12 ? "DYB" : age <= 14 ? "DBB" : "DPM";
    return `${division} ${program}`;
  });
}

export function getAgeDivisionNumber(label: string) {
  const match =
    label.match(/^(\d{1,2})U\b/i) || label.match(/\b(\d{1,2})U\b/i);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

export function sortTeamsManagementAgeGroups(a: string, b: string) {
  const ageA = getAgeDivisionNumber(a);
  const ageB = getAgeDivisionNumber(b);
  if (ageA !== null && ageB !== null && ageA !== ageB) return ageA - ageB;
  if (ageA !== null && ageB === null) return -1;
  if (ageA === null && ageB !== null) return 1;
  return a.localeCompare(b);
}

export function mergeTeamsManagementAgeGroupOptions(
  defaults: readonly string[],
  existing: readonly string[],
) {
  const options = new Map<string, string>();
  for (const value of [...defaults, ...existing]) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!options.has(key)) options.set(key, normalized);
  }
  return Array.from(options.values()).sort(sortTeamsManagementAgeGroups);
}

export function getTeamListSampleCsv(targetOrg: TeamsOrgId) {
  const defaults = getTeamsManagementAgeGroupDefaults(targetOrg);
  const sampleAgeGroups = ["8U", "10U"].map(
    (ageDivision) =>
      defaults.find((option) =>
        option.toLowerCase().startsWith(ageDivision.toLowerCase()),
      ) || `${ageDivision}${targetOrg === "fallball" ? " Fall" : ""}`,
  );

  if (targetOrg === "fallball") {
    return `Age Group,MLB Team
${sampleAgeGroups[0]},Yankees
${sampleAgeGroups[1]},Astros`;
  }

  return `Age Group,Team Name
${sampleAgeGroups[0]},Acme Plumbing - Smith
${sampleAgeGroups[1]},Main Street Dental - Garcia`;
}

export type ImportHistoryLike = {
  createdByName?: string | null;
  createdByEmail?: string | null;
  createdBy?: { name?: string | null; email?: string | null } | null;
  importType?: string | null;
  organizationId?: string | null;
  undoneAt?: string | null;
  status?: string | null;
};

export function getImportHistoryActor(item: ImportHistoryLike) {
  return (
    item.createdByName ||
    item.createdBy?.name ||
    item.createdByEmail ||
    item.createdBy?.email ||
    "administrator not recorded"
  );
}

export function getImportHistoryWhat(item: ImportHistoryLike) {
  const importType = item.importType || "player roster import";
  const org = item.organizationId ? ` for ${item.organizationId}` : "";
  return `${importType}${org}`;
}

export function getImportHistoryUndoText(item: ImportHistoryLike) {
  if (item.undoneAt) {
    return `Already undone ${new Date(item.undoneAt).toLocaleString()}`;
  }
  if (item.status !== "DONE") return "Undo available after this batch finishes";
  return "Undo can remove created rows and restore updated players";
}
