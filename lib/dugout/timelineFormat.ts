/**
 * Pure formatting helpers for Dugout timeline (Phase 7).
 * Matches legacy DugoutTimeline behavior so extractions stay drop-in.
 */

export type DugoutAuthorLike = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
};

export function getDisplayName(author: DugoutAuthorLike) {
  if (author.firstName || author.lastName) {
    return [author.firstName, author.lastName].filter(Boolean).join(" ");
  }
  return author.name || author.email || "Member";
}

export function formatPostTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRelativeTime(value: string) {
  const then = new Date(value).getTime();
  const now = Date.now();
  const diffSeconds = Math.max(1, Math.floor((now - then) / 1000));

  if (diffSeconds < 60) return `${diffSeconds}s`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  return formatPostTime(value);
}

export type ScheduleGameLike = {
  start_time?: string | null;
  localized_time?: string | null;
  localized_date?: string | null;
  subvenue?: string | null;
  _embedded?: { venue?: { name?: string | null } | null } | null;
};

export function formatScheduleTime(game: ScheduleGameLike) {
  if (game.start_time) {
    return new Date(game.start_time).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const date =
    typeof game.localized_date === "string" ? game.localized_date : "Date TBD";
  const time =
    typeof game.localized_time === "string" ? game.localized_time : "TBD";
  return `${date} ${time}`.trim();
}

export function formatScheduleDayLabel(game: ScheduleGameLike) {
  if (game.start_time) {
    return new Date(game.start_time).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  return typeof game.localized_date === "string"
    ? game.localized_date
    : "Date TBD";
}

export function getScheduleDaySortValue(game: ScheduleGameLike) {
  if (game.start_time) {
    return new Date(game.start_time).getTime();
  }

  if (typeof game.localized_date === "string") {
    const parsed = new Date(game.localized_date).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Number.MAX_SAFE_INTEGER;
}

export function getParkLabel(game: ScheduleGameLike) {
  return typeof game._embedded?.venue?.name === "string" &&
    game._embedded.venue.name.trim()
    ? game._embedded.venue.name.trim()
    : "Other Parks";
}

export function getFieldLabel(game: ScheduleGameLike) {
  return typeof game.subvenue === "string" && game.subvenue.trim()
    ? game.subvenue.trim()
    : "Other Fields";
}

export function getGameTimeSortValue(game: ScheduleGameLike) {
  if (game.start_time) {
    return new Date(game.start_time).getTime();
  }
  return Number.MAX_SAFE_INTEGER;
}
