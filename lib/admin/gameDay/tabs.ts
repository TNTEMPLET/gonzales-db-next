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

const SAFE_FIELD_DESK_QUERY_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/;

/**
 * Server redirect target for /admin/field-desk.
 * Copies ordinary query params (org, park, and any other safe key already on the URL).
 * The hash is not available here; Game Day applies it when no tab is set.
 */
export function fieldDeskRedirectHref(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!SAFE_FIELD_DESK_QUERY_KEY.test(key) || value == null) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item === "string") next.append(key, item);
    }
  }
  const query = next.toString();
  return query ? `/admin/game-day?${query}` : "/admin/game-day";
}

/**
 * Game Day URL when an old field-desk hash should choose the tab.
 * Returns null when a tab query is already set, or the hash is not a known bookmark.
 */
export function gameDayHrefForLegacyHash(input: { search: string; hash: string }): string | null {
  const params = new URLSearchParams(input.search.replace(/^\?/, ""));
  if (params.has("tab")) return null;
  const tab = fieldDeskHashToTab(input.hash);
  if (!tab) return null;
  params.set("tab", tab);
  const query = params.toString();
  return query ? `/admin/game-day?${query}` : "/admin/game-day";
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
