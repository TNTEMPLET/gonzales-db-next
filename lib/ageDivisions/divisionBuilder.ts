/**
 * Scratch "Division Builder" table. Pure row edits, per-row cutoff windows,
 * gap/overlap notes, and browser-storage JSON. Nothing here reads or writes
 * the database. Forecast math stays in `compute.ts` / `forecast.ts`.
 */

import { coverageWarnings, effectiveCutoffDate, effectiveRange } from "./compute";
import { formatCalendarDate } from "./present";
import { MAX_DIVISION_COUNT, validateSeasonWrite } from "./schema";
import type { CoverageWarning, DivisionAgeConfig, LeagueAgeRule } from "./types";

export const BUILDER_STORAGE_VERSION = 1;

export const BUILDER_CHARTERS = [
  { id: "ll", label: "Little League (LL)", tag: "LL" },
  { id: "dyb", label: "Diamond / Dixie (DYB/DBB)", tag: "DYB/DBB" },
  { id: "both", label: "Both leagues", tag: "Both" },
  { id: "teeball", label: "Tee-ball", tag: "Tee-ball" },
  { id: "other", label: "Other", tag: "Other" },
] as const;

export const BUILDER_CUTOFFS = [
  {
    id: "little-league",
    label: "Little League (Aug 31)",
    detail: "A player’s age is their age on August 31 of the season year.",
  },
  {
    id: "dyb",
    label: "Dixie / Diamond DYB (Apr 30)",
    detail: "A player’s age is their age on April 30 of the season year.",
  },
  {
    id: "custom",
    label: "Custom",
    detail: "Pick the month and day this division uses.",
  },
] as const;

export type BuilderCharter = (typeof BUILDER_CHARTERS)[number]["id"];
export type BuilderCutoff = (typeof BUILDER_CUTOFFS)[number]["id"];

export type BuilderRow = {
  id: string;
  name: string;
  minAge: number;
  maxAge: number;
  charter: BuilderCharter;
  cutoff: BuilderCutoff;
  customMonth: number;
  customDay: number;
  yearOffset: number;
  /** `YYYY-MM-DD` or empty. When set, this date replaces the calculated one. */
  oldestOverride: string;
  youngestOverride: string;
};

export type BuilderTable = {
  version: typeof BUILDER_STORAGE_VERSION;
  organizationId: string;
  seasonYear: number;
  rows: BuilderRow[];
};

export type BuilderWindow = {
  cutoffIso: string;
  oldest: string;
  youngest: string;
  oldestOverridden: boolean;
  youngestOverridden: boolean;
  /** Plain sentence, e.g. "born Sep 1, 2019 – Aug 31, 2020". */
  label: string;
  usable: boolean;
  /** True when the typed day does not exist in that month and was pulled back. */
  cutoffClamped: boolean;
};

export type BuilderIssue = {
  kind: "gap" | "overlap" | "invalid" | "incomplete";
  message: string;
  rowIds: string[];
};

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type BuilderParseResult = { ok: true; table: BuilderTable } | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROW_ID = /^[A-Za-z0-9_-]{1,80}$/;
const ORG_ID = /^[a-z0-9_-]{1,40}$/;

let rowCounter = 0;

export function createBuilderRowId(): string {
  rowCounter += 1;
  const stamp = Date.now().toString(36);
  const salt = Math.random().toString(36).slice(2, 8);
  return `div-${stamp}-${rowCounter}-${salt}`;
}

export function blankBuilderTable(organizationId: string, seasonYear: number): BuilderTable {
  return {
    version: BUILDER_STORAGE_VERSION,
    organizationId,
    seasonYear,
    rows: [],
  };
}

export function newBuilderRow(id: string, patch: Partial<Omit<BuilderRow, "id">> = {}): BuilderRow {
  return normalizeRow({
    id,
    name: "",
    minAge: 8,
    maxAge: 8,
    charter: "ll",
    cutoff: "little-league",
    customMonth: 8,
    customDay: 31,
    yearOffset: 0,
    oldestOverride: "",
    youngestOverride: "",
    ...patch,
  });
}

export function addBuilderRow(
  table: BuilderTable,
  patch: Partial<Omit<BuilderRow, "id">> = {},
  id = createBuilderRowId(),
): BuilderTable {
  if (table.rows.length >= MAX_DIVISION_COUNT) return cloneTable(table);
  const nextId = table.rows.some((row) => row.id === id) ? createBuilderRowId() : id;
  return { ...cloneTable(table), rows: [...table.rows.map(cloneRow), newBuilderRow(nextId, patch)] };
}

export function removeBuilderRow(table: BuilderTable, id: string): BuilderTable {
  if (!table.rows.some((row) => row.id === id)) return cloneTable(table);
  return { ...cloneTable(table), rows: table.rows.filter((row) => row.id !== id).map(cloneRow) };
}

export function updateBuilderRow(
  table: BuilderTable,
  id: string,
  patch: Partial<Omit<BuilderRow, "id">>,
): BuilderTable {
  if (!table.rows.some((row) => row.id === id)) return cloneTable(table);
  return {
    ...cloneTable(table),
    rows: table.rows.map((row) => (row.id === id ? normalizeRow({ ...row, ...patch, id }) : cloneRow(row))),
  };
}

export function moveBuilderRow(table: BuilderTable, id: string, direction: "up" | "down"): BuilderTable {
  const index = table.rows.findIndex((row) => row.id === id);
  if (index < 0) return cloneTable(table);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= table.rows.length) return cloneTable(table);
  const rows = table.rows.map(cloneRow);
  const [moved] = rows.splice(index, 1);
  rows.splice(target, 0, moved!);
  return { ...cloneTable(table), rows };
}

export function startOverBuilderTable(table: BuilderTable): BuilderTable {
  return blankBuilderTable(table.organizationId, table.seasonYear);
}

export function charterTag(charter: BuilderCharter): string {
  return BUILDER_CHARTERS.find((item) => item.id === charter)?.tag ?? "Other";
}

export function rowRule(row: BuilderRow): LeagueAgeRule {
  const yearOffset = clampOffset(row.yearOffset);
  if (row.cutoff === "little-league") return { cutoffMonth: 8, cutoffDay: 31, yearOffset };
  if (row.cutoff === "dyb") return { cutoffMonth: 4, cutoffDay: 30, yearOffset };
  return {
    cutoffMonth: clampInt(row.customMonth, 1, 12, 8),
    cutoffDay: clampInt(row.customDay, 1, 31, 1),
    yearOffset,
  };
}

/** Cutoff actually used for the window, after an impossible day is pulled back. */
export function normalizedRowRule(row: BuilderRow, seasonYear: number): LeagueAgeRule {
  const rule = rowRule(row);
  const cutoffIso = effectiveCutoffDate(rule, seasonYear);
  return {
    cutoffMonth: Number(cutoffIso.slice(5, 7)),
    cutoffDay: Number(cutoffIso.slice(8, 10)),
    yearOffset: rule.yearOffset,
  };
}

export function builderRowWindow(row: BuilderRow, seasonYear: number): BuilderWindow {
  const requested = rowRule(row);
  const cutoffIso = effectiveCutoffDate(requested, seasonYear);
  const used = normalizedRowRule(row, seasonYear);
  const division: DivisionAgeConfig = {
    code: row.id,
    label: row.name.trim() || "Division",
    minAge: row.minAge,
    maxAge: row.maxAge,
    sortOrder: 1,
  };
  if (isIsoDate(row.oldestOverride)) division.oldestBirthdate = row.oldestOverride.trim();
  if (isIsoDate(row.youngestOverride)) division.youngestBirthdate = row.youngestOverride.trim();
  const range = effectiveRange(division, cutoffIso);
  const agesOk = Number.isInteger(row.minAge) && Number.isInteger(row.maxAge) && row.minAge <= row.maxAge;
  const usable = agesOk && range.oldest !== "" && range.youngest !== "" && range.oldest <= range.youngest;
  return {
    cutoffIso,
    oldest: range.oldest,
    youngest: range.youngest,
    oldestOverridden: range.oldestOverridden,
    youngestOverridden: range.youngestOverridden,
    label: formatBirthdateWindow(range, range.oldestOverridden || range.youngestOverridden),
    usable,
    cutoffClamped: requested.cutoffMonth !== used.cutoffMonth || requested.cutoffDay !== used.cutoffDay,
  };
}

export function formatBirthdateWindow(
  range: { oldest: string; youngest: string },
  overridden = false,
): string {
  if (!range.oldest || !range.youngest) return "Enter ages to see who belongs in this division.";
  if (range.oldest > range.youngest) return "The oldest birthdate is after the youngest. Fix the ages or the overrides.";
  const window = `born ${formatCalendarDate(range.oldest)} – ${formatCalendarDate(range.youngest)}`;
  return overridden ? `${window} (using your override)` : window;
}

export function builderRowIssues(row: BuilderRow): string[] {
  const issues: string[] = [];
  if (!row.name.trim()) issues.push("Name this division.");
  if (!Number.isInteger(row.minAge) || row.minAge < 0 || row.minAge > 25) {
    issues.push("Low age must be a whole number from 0 to 25.");
  }
  if (!Number.isInteger(row.maxAge) || row.maxAge < 0 || row.maxAge > 25) {
    issues.push("High age must be a whole number from 0 to 25.");
  } else if (Number.isInteger(row.minAge) && row.minAge > row.maxAge) {
    issues.push("The low age has to be the same as or younger than the high age.");
  }
  if (row.oldestOverride.trim() && !isIsoDate(row.oldestOverride)) {
    issues.push("Oldest override must be a real date.");
  }
  if (row.youngestOverride.trim() && !isIsoDate(row.youngestOverride)) {
    issues.push("Youngest override must be a real date.");
  }
  return issues;
}

export type BuilderRowView = {
  row: BuilderRow;
  index: number;
  code: string;
  title: string;
  window: BuilderWindow;
  issues: string[];
};

export function builderRowViews(table: BuilderTable): BuilderRowView[] {
  const used = new Set<string>();
  return table.rows.map((row, index) => ({
    row,
    index,
    code: divisionCode(row.name, index, used),
    title: divisionTitle(row, index),
    window: builderRowWindow(row, table.seasonYear),
    issues: builderRowIssues(row),
  }));
}

export function builderCoverageIssues(table: BuilderTable): BuilderIssue[] {
  const views = builderRowViews(table);
  const issues: BuilderIssue[] = [];
  for (const view of views) {
    for (const message of view.issues) {
      issues.push({ kind: "incomplete", message: `${view.title}: ${message}`, rowIds: [view.row.id] });
    }
  }
  const divisions: DivisionAgeConfig[] = [];
  const idByCode = new Map<string, string>();
  for (const view of views) {
    if (!view.window.usable) continue;
    idByCode.set(view.code, view.row.id);
    divisions.push({
      code: view.code,
      label: view.title,
      minAge: view.row.minAge,
      maxAge: view.row.maxAge,
      sortOrder: view.index + 1,
      oldestBirthdate: view.window.oldest,
      youngestBirthdate: view.window.youngest,
    });
  }
  const warnings = coverageWarnings(divisions, "2000-06-15");
  for (const warning of warnings) {
    issues.push(issueFromWarning(warning, views, idByCode));
  }
  return issues;
}

export type BuilderForecastDraft = {
  proposed: { cutoff: LeagueAgeRule; divisions: DivisionAgeConfig[] } | null;
  skipped: string[];
  error: string | null;
};

/**
 * One cutoff plus explicit birthdate overrides, so the existing forecast can
 * count a table whose rows do not all share a cutoff. Read-only payload.
 */
export function builderForecastProposed(table: BuilderTable): BuilderForecastDraft {
  const views = builderRowViews(table);
  const skipped: string[] = [];
  const divisions: DivisionAgeConfig[] = [];
  for (const view of views) {
    if (view.issues.length > 0 || !view.window.usable) {
      skipped.push(view.title);
      continue;
    }
    divisions.push({
      code: view.code,
      label: view.title,
      minAge: view.row.minAge,
      maxAge: view.row.maxAge,
      sortOrder: divisions.length + 1,
      oldestBirthdate: view.window.oldest,
      youngestBirthdate: view.window.youngest,
    });
  }
  if (divisions.length === 0) {
    return {
      proposed: null,
      skipped,
      error: table.rows.length === 0 ? null : "Finish the highlighted divisions to see player counts.",
    };
  }
  const firstReady = views.find((view) => view.issues.length === 0 && view.window.usable);
  const cutoff = firstReady ? normalizedRowRule(firstReady.row, table.seasonYear) : { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 };
  const proposed = { cutoff, divisions };
  const validated = validateSeasonWrite(proposed, table.seasonYear);
  if (!validated.ok) {
    return { proposed: null, skipped, error: validated.error };
  }
  if (validated.data.reset) {
    return { proposed: null, skipped, error: "This table cannot be counted yet." };
  }
  return { proposed: { cutoff: validated.data.cutoff, divisions: validated.data.divisions }, skipped, error: null };
}

export function builderStorageKey(organizationId: string, seasonYear: number): string {
  return `apbaseball-division-builder:v${BUILDER_STORAGE_VERSION}:${organizationId}:${seasonYear}`;
}

export function serializeBuilderTable(table: BuilderTable): string {
  return JSON.stringify(toDocument(table), null, 2);
}

export function parseBuilderTable(raw: string): BuilderParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "This file is not a division builder table." };
  }
  const record = value as Record<string, unknown>;
  if (record.version !== BUILDER_STORAGE_VERSION) {
    return { ok: false, error: "This file was saved by a different version of the division builder." };
  }
  if (typeof record.organizationId !== "string" || !ORG_ID.test(record.organizationId)) {
    return { ok: false, error: "This file is missing a league." };
  }
  if (!Number.isInteger(record.seasonYear) || (record.seasonYear as number) < 1990 || (record.seasonYear as number) > 2200) {
    return { ok: false, error: "This file has a season year we cannot use." };
  }
  if (!Array.isArray(record.rows)) {
    return { ok: false, error: "This file has no division list." };
  }
  if (record.rows.length > MAX_DIVISION_COUNT) {
    return { ok: false, error: `Keep the list to ${MAX_DIVISION_COUNT} divisions or fewer.` };
  }
  const rows: BuilderRow[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < record.rows.length; index += 1) {
    const parsed = parseRow(record.rows[index], index);
    if (!parsed.ok) return parsed;
    if (seen.has(parsed.row.id)) return { ok: false, error: `Row ${index + 1} repeats an id.` };
    seen.add(parsed.row.id);
    rows.push(parsed.row);
  }
  return {
    ok: true,
    table: {
      version: BUILDER_STORAGE_VERSION,
      organizationId: record.organizationId,
      seasonYear: record.seasonYear as number,
      rows,
    },
  };
}

export function loadBuilderTable(
  store: KeyValueStore,
  organizationId: string,
  seasonYear: number,
): BuilderTable | null {
  let raw: string | null;
  try {
    raw = store.getItem(builderStorageKey(organizationId, seasonYear));
  } catch {
    return null;
  }
  if (!raw) return null;
  const parsed = parseBuilderTable(raw);
  if (!parsed.ok) return null;
  if (parsed.table.organizationId !== organizationId || parsed.table.seasonYear !== seasonYear) return null;
  return parsed.table;
}

export function saveBuilderTable(store: KeyValueStore, table: BuilderTable): void {
  store.setItem(builderStorageKey(table.organizationId, table.seasonYear), serializeBuilderTable(table));
}

export function clearBuilderTable(store: KeyValueStore, organizationId: string, seasonYear: number): void {
  store.removeItem(builderStorageKey(organizationId, seasonYear));
}

function issueFromWarning(
  warning: CoverageWarning,
  views: readonly BuilderRowView[],
  idByCode: ReadonlyMap<string, string>,
): BuilderIssue {
  const titles = warning.divisionCodes.map((code) => views.find((view) => view.code === code)?.title ?? code);
  const names = titles.length <= 1 ? titles[0] ?? "A division" : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
  const span = `${formatCalendarDate(warning.from)} – ${formatCalendarDate(warning.to)}`;
  const rowIds = warning.divisionCodes.map((code) => idByCode.get(code)).filter((id): id is string => Boolean(id));
  if (warning.kind === "gap") {
    return {
      kind: "gap",
      message: `Gap: kids born ${span} are not in a division. The nearest divisions are ${names}.`,
      rowIds,
    };
  }
  if (warning.kind === "overlap") {
    return {
      kind: "overlap",
      message: `Overlap: kids born ${span} fit in more than one division (${names}).`,
      rowIds,
    };
  }
  return {
    kind: "invalid",
    message: `Check ${names}: the birthdate window is not usable (${span}).`,
    rowIds,
  };
}

function divisionTitle(row: BuilderRow, index: number): string {
  const name = row.name.trim() || `Division ${index + 1}`;
  const titled = `${name} (${charterTag(row.charter)})`;
  return titled.length <= 80 ? titled : titled.slice(0, 80);
}

function divisionCode(name: string, index: number, used: Set<string>): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const base = (trimmed || `Division ${index + 1}`).slice(0, 40);
  let code = base;
  let n = 2;
  while (used.has(code)) {
    const suffix = ` (${n})`;
    code = `${base.slice(0, Math.max(1, 40 - suffix.length)).trimEnd()}${suffix}`;
    n += 1;
    if (n > MAX_DIVISION_COUNT + 2) break;
  }
  used.add(code);
  return code;
}

function parseRow(value: unknown, index: number): { ok: true; row: BuilderRow } | { ok: false; error: string } {
  const label = `Row ${index + 1}`;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: `${label} is not a division.` };
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !ROW_ID.test(record.id)) {
    return { ok: false, error: `${label} is missing an id.` };
  }
  if (typeof record.name !== "string" || record.name.length > 80) {
    return { ok: false, error: `${label} needs a name of 80 characters or fewer.` };
  }
  if (!isCharter(record.charter)) {
    return { ok: false, error: `${label} needs a league such as LL or DYB/DBB.` };
  }
  if (!isCutoff(record.cutoff)) {
    return { ok: false, error: `${label} needs a Little League, Dixie/Diamond, or Custom cutoff.` };
  }
  const minAge = record.minAge;
  const maxAge = record.maxAge;
  if (!Number.isInteger(minAge) || (minAge as number) < 0 || (minAge as number) > 25) {
    return { ok: false, error: `${label} needs a low age from 0 to 25.` };
  }
  if (!Number.isInteger(maxAge) || (maxAge as number) < 0 || (maxAge as number) > 25) {
    return { ok: false, error: `${label} needs a high age from 0 to 25.` };
  }
  if (!Number.isInteger(record.customMonth) || (record.customMonth as number) < 1 || (record.customMonth as number) > 12) {
    return { ok: false, error: `${label} needs a cutoff month from 1 to 12.` };
  }
  if (!Number.isInteger(record.customDay) || (record.customDay as number) < 1 || (record.customDay as number) > 31) {
    return { ok: false, error: `${label} needs a cutoff day from 1 to 31.` };
  }
  if (!Number.isInteger(record.yearOffset) || (record.yearOffset as number) < -1 || (record.yearOffset as number) > 2) {
    return { ok: false, error: `${label} needs a year offset from -1 to 2.` };
  }
  const oldest = typeof record.oldestOverride === "string" ? record.oldestOverride : "";
  const youngest = typeof record.youngestOverride === "string" ? record.youngestOverride : "";
  if (oldest.trim() && !isIsoDate(oldest)) return { ok: false, error: `${label} has an oldest override that is not a date.` };
  if (youngest.trim() && !isIsoDate(youngest)) {
    return { ok: false, error: `${label} has a youngest override that is not a date.` };
  }
  return {
    ok: true,
    row: {
      id: record.id,
      name: record.name,
      minAge: minAge as number,
      maxAge: maxAge as number,
      charter: record.charter,
      cutoff: record.cutoff,
      customMonth: record.customMonth as number,
      customDay: record.customDay as number,
      yearOffset: record.yearOffset as number,
      oldestOverride: oldest.trim(),
      youngestOverride: youngest.trim(),
    },
  };
}

function toDocument(table: BuilderTable): BuilderTable {
  return {
    version: BUILDER_STORAGE_VERSION,
    organizationId: table.organizationId,
    seasonYear: table.seasonYear,
    rows: table.rows.map((row) => ({
      id: row.id,
      name: row.name,
      minAge: row.minAge,
      maxAge: row.maxAge,
      charter: row.charter,
      cutoff: row.cutoff,
      customMonth: row.customMonth,
      customDay: row.customDay,
      yearOffset: row.yearOffset,
      oldestOverride: row.oldestOverride,
      youngestOverride: row.youngestOverride,
    })),
  };
}

function normalizeRow(row: BuilderRow): BuilderRow {
  return {
    id: row.id,
    name: row.name.slice(0, 80),
    minAge: clampAge(row.minAge),
    maxAge: clampAge(row.maxAge),
    charter: isCharter(row.charter) ? row.charter : "ll",
    cutoff: isCutoff(row.cutoff) ? row.cutoff : "little-league",
    customMonth: clampInt(row.customMonth, 1, 12, 8),
    customDay: clampInt(row.customDay, 1, 31, 1),
    yearOffset: clampOffset(row.yearOffset),
    oldestOverride: isIsoDate(row.oldestOverride) ? row.oldestOverride.trim() : "",
    youngestOverride: isIsoDate(row.youngestOverride) ? row.youngestOverride.trim() : "",
  };
}

function isCharter(value: unknown): value is BuilderCharter {
  return BUILDER_CHARTERS.some((item) => item.id === value);
}

function isCutoff(value: unknown): value is BuilderCutoff {
  return BUILDER_CUTOFFS.some((item) => item.id === value);
}

function isIsoDate(value: string): boolean {
  if (typeof value !== "string" || !ISO_DATE.test(value.trim())) return false;
  const trimmed = value.trim();
  const year = Number(trimmed.slice(0, 4));
  const month = Number(trimmed.slice(5, 7));
  const day = Number(trimmed.slice(8, 10));
  if (month < 1 || month > 12) return false;
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= max;
}

function clampAge(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clampInt(Math.trunc(value), 0, 25, 0);
}

function clampOffset(value: number): number {
  if (!Number.isInteger(value)) return 0;
  return clampInt(value, -1, 2, 0);
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const truncated = Math.trunc(value);
  if (truncated < min) return min;
  if (truncated > max) return max;
  return truncated;
}

function cloneRow(row: BuilderRow): BuilderRow {
  return { ...row };
}

function cloneTable(table: BuilderTable): BuilderTable {
  return {
    version: table.version,
    organizationId: table.organizationId,
    seasonYear: table.seasonYear,
    rows: table.rows.map(cloneRow),
  };
}
