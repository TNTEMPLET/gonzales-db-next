export const GAME_DAY_TABS = ["today", "cards", "controllers", "scores", "pay"] as const;

export type GameDayTab = (typeof GAME_DAY_TABS)[number];

export function parseGameDayTab(value: string | null | undefined): GameDayTab {
  if (value === "cards" || value === "controllers" || value === "scores" || value === "pay") {
    return value;
  }
  return "today";
}

/** Field-desk bookmarks land on the matching Game Day tab. */
export function fieldDeskHashToTab(hash: string): GameDayTab | null {
  const value = hash.replace(/^#/, "").trim().toLowerCase();
  if (value === "controllers") return "controllers";
  if (value === "cards" || value === "where") return "cards";
  return null;
}

export function gameDayHref(input: {
  org: string;
  tab?: GameDayTab;
  parkId?: string | null;
  day?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("org", input.org);
  if (input.day) params.set("day", input.day);
  if (input.parkId) params.set("park", input.parkId);
  if (input.tab && input.tab !== "today") params.set("tab", input.tab);
  return `/admin/game-day?${params.toString()}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseGameDayDate(value: string | null | undefined, fallback: string): string {
  const day = value?.trim() ?? "";
  return ISO_DATE.test(day) ? day : fallback;
}
