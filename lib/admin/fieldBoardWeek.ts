import { resolveDivisionSlotTime, type DivisionSlotTimes } from "./divisionSlotTimes";

export const FIELD_BOARD_DAYS = [
  { dayOfWeek: 1, label: "Monday" },
  { dayOfWeek: 2, label: "Tuesday" },
  { dayOfWeek: 3, label: "Wednesday" },
  { dayOfWeek: 4, label: "Thursday" },
  { dayOfWeek: 5, label: "Friday" },
] as const;

export type FieldWeekCell = string[];
export type FieldWeek = Record<number, [FieldWeekCell, FieldWeekCell]>;

export function emptyFieldWeek(): FieldWeek {
  return {
    1: [[], []],
    2: [[], []],
    3: [[], []],
    4: [[], []],
    5: [[], []],
  };
}

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

/** Accept a legacy single string, a comma list, or an array of those. */
export function parseCellDivisions(value: unknown): string[] {
  if (typeof value === "string") return uniqueTrimmed(value.split(","));
  if (!Array.isArray(value)) return [];
  const parts: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") parts.push(...entry.split(","));
  }
  return uniqueTrimmed(parts);
}

export function serializeCellDivisions(divisions: readonly string[]): string | null {
  const list = uniqueTrimmed([...divisions]);
  return list.length ? list.join(", ") : null;
}

export function toggleCellDivision(current: readonly string[], division: string): string[] {
  const label = division.trim();
  if (!label) return uniqueTrimmed([...current]);
  const list = uniqueTrimmed([...current]);
  return list.includes(label) ? list.filter((entry) => entry !== label) : [...list, label];
}

export function parseFieldWeek(metaWeek: unknown): FieldWeek {
  const week = emptyFieldWeek();
  if (!metaWeek || typeof metaWeek !== "object") return week;
  const record = metaWeek as Record<string, unknown>;
  for (const day of FIELD_BOARD_DAYS) {
    const row = record[String(day.dayOfWeek)];
    if (!Array.isArray(row) || row.length < 2) continue;
    week[day.dayOfWeek] = [parseCellDivisions(row[0]), parseCellDivisions(row[1])];
  }
  return week;
}

export function divisionsUsedInWeek(week: FieldWeek): string[] {
  const found = new Set<string>();
  for (const day of FIELD_BOARD_DAYS) {
    for (const cell of week[day.dayOfWeek]) {
      for (const division of cell) found.add(division);
    }
  }
  return [...found];
}

export function weekDivisionsFromMeta(fieldMetadata: unknown): string[] {
  if (!fieldMetadata || typeof fieldMetadata !== "object") return [];
  return divisionsUsedInWeek(parseFieldWeek((fieldMetadata as { week?: unknown }).week));
}

/** Park-level weekly-board allowlist stored on field metadata. */
export function parseBoardDivisions(fieldMetadata: unknown): string[] {
  if (!fieldMetadata || typeof fieldMetadata !== "object") return [];
  return parseCellDivisions((fieldMetadata as { boardDivisions?: unknown }).boardDivisions);
}

export function parkBoardDivisionsFromFields(
  fields: readonly { fieldMetadata?: unknown }[],
): string[] {
  const found = new Set<string>();
  for (const field of fields) {
    for (const division of parseBoardDivisions(field.fieldMetadata)) found.add(division);
  }
  return [...found];
}

/**
 * Empty filter = every org division. Non-empty = only those chips.
 * Divisions already checked on a cell still appear so they can be turned off.
 */
export function weeklyBoardDivisionOptions(
  allDivisions: readonly string[],
  filter: readonly string[],
  selectedInCell: readonly string[] = [],
): string[] {
  const all = uniqueTrimmed([...allDivisions]);
  const allowed = uniqueTrimmed([...filter]);
  const selected = uniqueTrimmed([...selectedInCell]);
  const core = allowed.length ? all.filter((division) => allowed.includes(division)) : all;
  const extras = selected.filter((division) => !core.includes(division));
  return [...core, ...extras];
}

export function resolveSharedSlotTime(
  divisions: readonly string[],
  slotIndex: 0 | 1,
  fieldSlotTime: string,
  overrides: DivisionSlotTimes,
): { time: string; conflict: boolean; conflictDivisions: string[] } {
  const list = uniqueTrimmed([...divisions]);
  if (!list.length) return { time: fieldSlotTime, conflict: false, conflictDivisions: [] };

  const resolved = list.map((division) => ({
    division,
    time: resolveDivisionSlotTime(division, slotIndex, fieldSlotTime, overrides),
  }));
  const times = [...new Set(resolved.map((entry) => entry.time))];
  if (times.length <= 1) {
    return { time: times[0] ?? fieldSlotTime, conflict: false, conflictDivisions: [] };
  }

  const time = resolved[0]?.time || fieldSlotTime;
  return {
    time,
    conflict: true,
    conflictDivisions: resolved.filter((entry) => entry.time !== time).map((entry) => entry.division),
  };
}
