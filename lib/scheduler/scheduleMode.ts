export const SCHEDULE_MODES = ["auto", "manual", "practiceGames"] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

const PRACTICE_GAME_DIVISIONS = new Set(["4U TB", "5U TB"]);
const MANUAL_DIVISIONS = new Set(["17U"]);

export function isScheduleMode(value: unknown): value is ScheduleMode {
  return value === "auto" || value === "manual" || value === "practiceGames";
}

export function defaultScheduleMode(division: string): ScheduleMode {
  const key = division.trim();
  if (PRACTICE_GAME_DIVISIONS.has(key)) return "practiceGames";
  if (MANUAL_DIVISIONS.has(key)) return "manual";
  return "auto";
}

export function parseScheduleMode(ruleMetadata: unknown, division?: string): ScheduleMode {
  if (ruleMetadata && typeof ruleMetadata === "object" && !Array.isArray(ruleMetadata)) {
    const raw = (ruleMetadata as { scheduleMode?: unknown }).scheduleMode;
    if (isScheduleMode(raw)) return raw;
  }
  return defaultScheduleMode(division ?? "");
}

export function withScheduleMode(ruleMetadata: unknown, scheduleMode: ScheduleMode): Record<string, unknown> {
  const base = ruleMetadata && typeof ruleMetadata === "object" && !Array.isArray(ruleMetadata)
    ? { ...(ruleMetadata as Record<string, unknown>) }
    : {};
  return { ...base, scheduleMode };
}

export function scheduleModeLabel(mode: ScheduleMode): string {
  if (mode === "manual") return "Manual / DH";
  if (mode === "practiceGames") return "Practice games";
  return "Auto";
}
