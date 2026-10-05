/**
 * Combined Spring save. What-if edits become the two league tables.
 *
 * Undo is one step, stored inside the existing `divisionAgesJson` on each
 * league. A combined save writes Gonzales and Ascension in one transaction and
 * stores the previous JSON on both rows. That snapshot has no nested
 * `previous`. `{ absent: true }` means the league had no season row. One
 * "Undo last save" writes both snapshots back and drops them, so a second undo
 * does nothing until the next combined save. A later save of one league on its
 * own replaces that league's JSON and drops its snapshot; undo is refused
 * until both leagues have a snapshot again.
 *
 * `spring` is never an organization id. Fall Ball is never written. Each
 * league keeps its own table cutoff. A row whose dates are missing is filled
 * from that league's cutoff, never the combined shell. A row whose window is
 * not that cutoff's calculated window is stored with explicit oldest and
 * youngest birthdates. A saved row belongs to exactly one league. Dropping a
 * division requires that code in `removedCodes`, and a league table cannot be
 * saved empty. Confirmation is kept only when that league's divisions did not
 * change.
 */

import { calculatedRange, effectiveCutoffDate, effectiveRange } from "@/lib/ageDivisions/compute";
import { formatCalendarDate } from "@/lib/ageDivisions/present";
import {
  readPreviousSnapshot,
  validateSeasonRecord,
  type SeasonDivisionAgesRecord,
  type SeasonPrevious,
} from "@/lib/ageDivisions/schema";
import type { CutoffPreset, DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";

import {
  isSpringLeagueOrg,
  leagueTaggedDivisionName,
  springLeagueSuffix,
  SPRING_LEAGUE_ORGS,
  type SpringLeagueOrg,
} from "./view";

const LEAGUE_TITLE: Record<SpringLeagueOrg, string> = {
  gonzales: "Gonzales DYB",
  ascension: "Ascension LL",
};

const STANDARD_CUTOFFS = {
  "little-league": { cutoffMonth: 8, cutoffDay: 31 },
  dyb: { cutoffMonth: 4, cutoffDay: 30 },
} as const;

export type SpringLeagueTable = {
  organizationId: SpringLeagueOrg;
  cutoff: LeagueAgeRule;
  divisions: readonly DivisionAgeConfig[];
  /** True when this league's saved JSON still has the one-step snapshot. */
  undoAvailable?: boolean;
  /** Token from the season read. The save route compares it inside the transaction. */
  baselineToken?: string;
};

export type CombinedSaveChange = {
  label: string;
  kind: "changed" | "added" | "removed";
  before: string;
  after: string;
  preset: string | null;
};

export type CombinedSaveLeaguePreview = {
  organizationId: SpringLeagueOrg;
  title: string;
  cutoffText: string;
  changes: CombinedSaveChange[];
};

export type CombinedSavePreview = {
  seasonYear: number;
  leagues: CombinedSaveLeaguePreview[];
};

export type SplitLeagueTable = {
  cutoff: LeagueAgeRule;
  divisions: DivisionAgeConfig[];
};

export function springCombinedSaveDenial(input: {
  authenticated: boolean;
  isMaster: boolean;
  masterDeployment: boolean;
}): { status: number; error: string } | null {
  if (!input.authenticated) return { status: 401, error: "Unauthorized" };
  if (!input.isMaster || !input.masterDeployment) {
    return { status: 403, error: "Master Admin required" };
  }
  return null;
}

export function cutoffPresetLabel(preset: CutoffPreset): string {
  if (preset === "little-league") return "Little League Aug 31";
  if (preset === "dyb") return "DYB Apr 30";
  return "Custom dates";
}

function windowText(oldest: string, youngest: string): string {
  if (!oldest || !youngest) return "No dates";
  return `${formatCalendarDate(oldest)} through ${formatCalendarDate(youngest)}`;
}

function cutoffPhrase(cutoff: LeagueAgeRule): string {
  const month = String(cutoff.cutoffMonth).padStart(2, "0");
  const day = String(cutoff.cutoffDay).padStart(2, "0");
  const formatted = formatCalendarDate(`2001-${month}-${day}`);
  const text = formatted.replace(", 2001", "");
  return `Table cutoff stays ${text}.`;
}

function sameWindow(left: { oldest: string; youngest: string }, right: { oldest: string; youngest: string }): boolean {
  return left.oldest === right.oldest && left.youngest === right.youngest;
}

function presetForWindow(
  division: Pick<DivisionAgeConfig, "minAge" | "maxAge">,
  window: { oldest: string; youngest: string },
  seasonYear: number,
  yearOffset: number,
): CutoffPreset {
  for (const preset of ["little-league", "dyb"] as const) {
    const iso = effectiveCutoffDate({ ...STANDARD_CUTOFFS[preset], yearOffset }, seasonYear);
    if (sameWindow(window, calculatedRange(division, iso))) return preset;
  }
  return "custom";
}

function persistLabel(display: string, org: SpringLeagueOrg, existingLabel: string | undefined): string {
  const trimmed = display.trim();
  if (existingLabel && trimmed === leagueTaggedDivisionName(existingLabel, org)) return existingLabel;
  if (existingLabel && trimmed === existingLabel) return existingLabel;
  const suffix = springLeagueSuffix(org);
  const stripped = trimmed.replace(new RegExp(`\\s+${suffix}$`, "i"), "").trim();
  if (stripped && stripped !== trimmed) return stripped;
  return trimmed;
}

function divisionCode(raw: string): { org: SpringLeagueOrg; code: string } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith("fallball:")) return { error: "Fall Ball is not part of this save." };
  if (trimmed.startsWith("spring:")) return { error: "Spring is a view, not a league that can be saved." };
  const match = /^(gonzales|ascension):(.+)$/.exec(trimmed);
  if (!match) return { error: "Every division must belong to Gonzales DYB or Ascension LL." };
  const org = match[1];
  const code = match[2]?.trim() ?? "";
  if (!isSpringLeagueOrg(org) || !code || code.length > 40 || code.includes(":") || /(gonzales|ascension|fallball|spring):/.test(code)) {
    return { error: "Each saved division must belong to exactly one league." };
  }
  return { org, code };
}

/**
 * Split the combined editor table into the two league records. The league
 * cutoff is the one already stored for that league, not the combined shell.
 */
export function removedCodesForCombinedSave(
  current: readonly SpringLeagueTable[],
  proposed: { divisions: readonly DivisionAgeConfig[] },
): Partial<Record<SpringLeagueOrg, string[]>> {
  const kept: Record<SpringLeagueOrg, Set<string>> = { gonzales: new Set(), ascension: new Set() };
  for (const division of proposed.divisions) {
    const parsed = divisionCode(division.code);
    if ("error" in parsed) continue;
    kept[parsed.org].add(parsed.code);
  }
  const removed: Partial<Record<SpringLeagueOrg, string[]>> = {};
  for (const league of current) {
    if (!isSpringLeagueOrg(league.organizationId)) continue;
    const dropped = league.divisions
      .map((division) => division.code)
      .filter((code) => !kept[league.organizationId].has(code));
    if (dropped.length > 0) removed[league.organizationId] = dropped;
  }
  return removed;
}

export function splitCombinedTable(
  proposed: { cutoff: LeagueAgeRule; divisions: readonly DivisionAgeConfig[] },
  leagues: readonly SpringLeagueTable[],
  seasonYear: number,
  removedCodes?: Partial<Record<SpringLeagueOrg, readonly string[]>>,
): { ok: true; leagues: Record<SpringLeagueOrg, SplitLeagueTable> } | { ok: false; error: string } {
  const byOrg = new Map(leagues.map((league) => [league.organizationId, league]));
  for (const org of SPRING_LEAGUE_ORGS) {
    if (!byOrg.has(org)) return { ok: false, error: "Both Spring leagues are required." };
  }
  const built: Record<SpringLeagueOrg, DivisionAgeConfig[]> = { gonzales: [], ascension: [] };
  for (const division of proposed.divisions) {
    const parsedCode = divisionCode(division.code);
    if ("error" in parsedCode) return { ok: false, error: parsedCode.error };
    const league = byOrg.get(parsedCode.org)!;
    const leagueIso = effectiveCutoffDate(league.cutoff, seasonYear);
    const range = effectiveRange(division, leagueIso);
    if (!range.oldest || !range.youngest || range.oldest > range.youngest) {
      return { ok: false, error: `${division.label || parsedCode.code} needs a real birthdate range.` };
    }
    const existing = league.divisions.find((row) => row.code === parsedCode.code);
    const calculated = calculatedRange(division, leagueIso);
    const preset = presetForWindow(division, range, seasonYear, league.cutoff.yearOffset);
    const next: DivisionAgeConfig = {
      code: parsedCode.code,
      label: persistLabel(division.label, parsedCode.org, existing?.label),
      minAge: division.minAge,
      maxAge: division.maxAge,
      sortOrder: built[parsedCode.org].length + 1,
      cutoffPreset: preset,
    };
    if (!sameWindow(range, calculated)) {
      next.oldestBirthdate = range.oldest;
      next.youngestBirthdate = range.youngest;
    }
    built[parsedCode.org].push(next);
  }
  for (const org of SPRING_LEAGUE_ORGS) {
    const league = byOrg.get(org)!;
    const kept = new Set(built[org].map((division) => division.code));
    const allowed = new Set(removedCodes?.[org] ?? []);
    for (const division of league.divisions) {
      if (kept.has(division.code) || allowed.has(division.code)) continue;
      return {
        ok: false,
        error: `${LEAGUE_TITLE[org]} dropped ${division.code} without confirming that removal.`,
      };
    }
    if (built[org].length === 0) {
      return { ok: false, error: `${LEAGUE_TITLE[org]} must keep at least one division.` };
    }
    if (built[org].length > 40) {
      return { ok: false, error: `${LEAGUE_TITLE[org]} can hold 40 divisions.` };
    }
    const seen = new Set<string>();
    for (const division of built[org]) {
      if (seen.has(division.code)) {
        return { ok: false, error: `${LEAGUE_TITLE[org]} already has a division named ${division.code}.` };
      }
      seen.add(division.code);
    }
  }
  return {
    ok: true,
    leagues: {
      gonzales: { cutoff: { ...byOrg.get("gonzales")!.cutoff }, divisions: built.gonzales },
      ascension: { cutoff: { ...byOrg.get("ascension")!.cutoff }, divisions: built.ascension },
    },
  };
}

function describe(division: DivisionAgeConfig, cutoff: LeagueAgeRule, seasonYear: number): string {
  const range = effectiveRange(division, effectiveCutoffDate(cutoff, seasonYear));
  const ages = division.minAge === division.maxAge ? `${division.minAge}U` : `${division.minAge}–${division.maxAge}U`;
  return `${ages}, ${windowText(range.oldest, range.youngest)}`;
}

export function combinedSavePreview(
  current: readonly SpringLeagueTable[],
  proposed: { cutoff: LeagueAgeRule; divisions: readonly DivisionAgeConfig[] },
  seasonYear: number,
): { ok: true; preview: CombinedSavePreview } | { ok: false; error: string } {
  const split = splitCombinedTable(proposed, current, seasonYear, removedCodesForCombinedSave(current, proposed));
  if (!split.ok) return split;
  const leagues = SPRING_LEAGUE_ORGS.map((org) => {
    const before = current.find((league) => league.organizationId === org)!;
    const after = split.leagues[org];
    const beforeByCode = new Map(before.divisions.map((division) => [division.code, division]));
    const afterByCode = new Map(after.divisions.map((division) => [division.code, division]));
    const changes: CombinedSaveChange[] = [];
    for (const division of after.divisions) {
      const previous = beforeByCode.get(division.code);
      if (!previous) {
        changes.push({
          label: division.label,
          kind: "added",
          before: "Not in this league",
          after: describe(division, after.cutoff, seasonYear),
          preset: cutoffPresetLabel(division.cutoffPreset ?? "custom"),
        });
        continue;
      }
      const beforeText = describe(previous, before.cutoff, seasonYear);
      const afterText = describe(division, after.cutoff, seasonYear);
      if (beforeText === afterText && previous.label === division.label) continue;
      changes.push({
        label: division.label,
        kind: "changed",
        before: beforeText,
        after: afterText,
        preset: division.cutoffPreset ? cutoffPresetLabel(division.cutoffPreset) : null,
      });
    }
    for (const division of before.divisions) {
      if (afterByCode.has(division.code)) continue;
      changes.push({
        label: division.label,
        kind: "removed",
        before: describe(division, before.cutoff, seasonYear),
        after: "Removed",
        preset: null,
      });
    }
    return {
      organizationId: org,
      title: LEAGUE_TITLE[org],
      cutoffText: cutoffPhrase(after.cutoff),
      changes,
    };
  });
  return { ok: true, preview: { seasonYear, leagues } };
}

function copyAudit(record: SeasonDivisionAgesRecord, target: SeasonDivisionAgesRecord) {
  if (record.confirmedAt) target.confirmedAt = record.confirmedAt;
  if (record.confirmedByAdminId) target.confirmedByAdminId = record.confirmedByAdminId;
}

function divisionIdentity(division: DivisionAgeConfig) {
  return {
    code: division.code,
    label: division.label,
    minAge: division.minAge,
    maxAge: division.maxAge,
    oldestBirthdate: division.oldestBirthdate || undefined,
    youngestBirthdate: division.youngestBirthdate || undefined,
    sortOrder: division.sortOrder,
    cutoffPreset: division.cutoffPreset,
  };
}

function sameDivisions(left: readonly DivisionAgeConfig[], right: readonly DivisionAgeConfig[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((division, index) => {
    const other = right[index];
    return other != null && JSON.stringify(divisionIdentity(division)) === JSON.stringify(divisionIdentity(other));
  });
}

/** The visible table only. Nested undo data is left off so the snapshot stays one step. */
export function snapshotWithoutPrevious(record: SeasonDivisionAgesRecord): SeasonPrevious {
  const snapshot: SeasonPrevious = {
    cutoff: { ...record.cutoff },
    divisions: record.divisions.map((division) => ({ ...division })),
  };
  if (record.confirmedAt) snapshot.confirmedAt = record.confirmedAt;
  if (record.confirmedByAdminId) snapshot.confirmedByAdminId = record.confirmedByAdminId;
  if (record.updatedAt) snapshot.updatedAt = record.updatedAt;
  if (record.updatedByAdminId) snapshot.updatedByAdminId = record.updatedByAdminId;
  return snapshot;
}

function previousFromStored(
  raw: unknown | null,
  org: SpringLeagueOrg,
  seasonYear: number,
): { ok: true; previous: SeasonPrevious; current: SeasonDivisionAgesRecord | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, previous: { absent: true }, current: null };
  const parsed = validateSeasonRecord(raw, seasonYear);
  if (!parsed.ok) {
    return {
      ok: false,
      error: `The saved table for ${LEAGUE_TITLE[org]} could not be read. Nothing was written.`,
    };
  }
  return { ok: true, previous: snapshotWithoutPrevious(parsed.data), current: parsed.data };
}

export function buildCombinedSaveRecords(
  split: Record<SpringLeagueOrg, SplitLeagueTable>,
  stored: Record<SpringLeagueOrg, unknown | null>,
  seasonYear: number,
  adminId: string,
  now: Date,
): { ok: true; records: Record<SpringLeagueOrg, SeasonDivisionAgesRecord> } | { ok: false; error: string } {
  const records = {} as Record<SpringLeagueOrg, SeasonDivisionAgesRecord>;
  for (const org of SPRING_LEAGUE_ORGS) {
    const prior = previousFromStored(stored[org], org, seasonYear);
    if (!prior.ok) return prior;
    const next: SeasonDivisionAgesRecord = {
      cutoff: { ...split[org].cutoff },
      divisions: split[org].divisions.map((division) => ({ ...division })),
      updatedAt: now.toISOString(),
      updatedByAdminId: adminId,
      previous: prior.previous,
    };
    if (prior.current && sameDivisions(prior.current.divisions, next.divisions)) copyAudit(prior.current, next);
    const checked = validateSeasonRecord(next, seasonYear);
    if (!checked.ok) return { ok: false, error: checked.error };
    records[org] = checked.data;
  }
  return { ok: true, records };
}

export function buildUndoRecords(
  stored: Record<SpringLeagueOrg, unknown | null>,
  seasonYear: number,
): { ok: true; records: Record<SpringLeagueOrg, SeasonDivisionAgesRecord | null> } | { ok: false; error: string } {
  const records = {} as Record<SpringLeagueOrg, SeasonDivisionAgesRecord | null>;
  for (const org of SPRING_LEAGUE_ORGS) {
    if (stored[org] == null) {
      return { ok: false, error: "Undo last save is not available." };
    }
    const parsed = validateSeasonRecord(stored[org], seasonYear);
    if (!parsed.ok || !parsed.data.previous) {
      return { ok: false, error: "Undo last save is not available." };
    }
    const previous = readPreviousSnapshot(parsed.data.previous);
    if (!previous) return { ok: false, error: "Undo last save is not available." };
    if ("absent" in previous && previous.absent === true) {
      records[org] = null;
      continue;
    }
    const restored = validateSeasonRecord(previous, seasonYear);
    if (!restored.ok) return { ok: false, error: "Undo last save is not available." };
    records[org] = restored.data;
  }
  return { ok: true, records };
}
