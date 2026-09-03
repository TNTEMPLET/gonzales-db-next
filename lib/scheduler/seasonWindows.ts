export type SeasonDateWindows = {
  gamesStartsOn: string;
  gamesEndsOn: string;
  practiceStartsOn: string;
  practiceEndsOn: string;
};

function settingDate(settings: unknown, key: string): string {
  if (!settings || typeof settings !== "object") return "";
  const value = (settings as Record<string, unknown>)[key];
  if (typeof value !== "string" || !value.trim()) return "";
  return value.trim().slice(0, 10);
}

export function parseSeasonDateWindows(
  settings: unknown,
  seasonStartsOn: string,
  seasonEndsOn: string,
): SeasonDateWindows {
  return {
    gamesStartsOn: settingDate(settings, "gamesStartsOn") || seasonStartsOn,
    gamesEndsOn: settingDate(settings, "gamesEndsOn") || seasonEndsOn,
    practiceStartsOn: settingDate(settings, "practiceStartsOn") || seasonStartsOn,
    practiceEndsOn: settingDate(settings, "practiceEndsOn") || seasonEndsOn,
  };
}

export function withSeasonDateWindows(
  existing: unknown,
  windows: SeasonDateWindows,
): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};
  return {
    ...base,
    gamesStartsOn: windows.gamesStartsOn || null,
    gamesEndsOn: windows.gamesEndsOn || null,
    practiceStartsOn: windows.practiceStartsOn || null,
    practiceEndsOn: windows.practiceEndsOn || null,
  };
}

export function parseUtcDateOnly(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const [year, month, day] = value.trim().slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}
