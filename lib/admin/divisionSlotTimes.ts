/** Slot 1 / Slot 2 start times that differ from the park default (e.g. 6U/7U/8U). */
export type DivisionSlotTimes = Record<string, [string, string]>;

export type DivisionTimeOverrideRow = {
  division: string;
  slot1: string;
  slot2: string;
};

/** Divisions that typically start later than the park default Slot 1. */
export function laterStartDivisions(org: string): string[] {
  if (org === "fallball") return ["6U MOD", "7U CP", "8U CP"];
  return [];
}

export function laterStartSlotDefaults(availableTimes: string[]): [string, string] {
  const slot1 = availableTimes.includes("18:00") ? "18:00" : (availableTimes[0] ?? "");
  const slot2 = availableTimes.includes("19:15") ? "19:15" : (availableTimes[1] ?? availableTimes[0] ?? "");
  return [slot1, slot2];
}

export function withSuggestedDivisionTimes(
  saved: DivisionTimeOverrideRow[],
  org: string,
  availableTimes: string[],
): DivisionTimeOverrideRow[] {
  const [slot1, slot2] = laterStartSlotDefaults(availableTimes);
  const next = [...saved];
  for (const division of laterStartDivisions(org)) {
    if (next.some((row) => row.division === division)) continue;
    next.push({ division, slot1, slot2 });
  }
  return next;
}

export function parseDivisionSlotTimes(settings: unknown): DivisionSlotTimes {
  if (!settings || typeof settings !== "object") return {};
  const raw = (settings as { divisionSlotTimes?: unknown }).divisionSlotTimes;
  if (!raw || typeof raw !== "object") return {};
  const next: DivisionSlotTimes = {};
  for (const [division, times] of Object.entries(raw)) {
    if (!Array.isArray(times) || typeof times[0] !== "string" || typeof times[1] !== "string") continue;
    if (!division.trim() || !times[0].trim() || !times[1].trim()) continue;
    next[division] = [times[0], times[1]];
  }
  return next;
}

export function resolveDivisionSlotTime(
  division: string,
  slotIndex: 0 | 1,
  fieldSlotTime: string,
  overrides: DivisionSlotTimes,
): string {
  if (!division) return fieldSlotTime;
  const override = overrides[division];
  if (override?.[slotIndex]) return override[slotIndex];
  return fieldSlotTime;
}
