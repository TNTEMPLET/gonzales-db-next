import {
  getSeasonConfigForOrg,
  leagueCalendarDate,
} from "@/lib/seasonConfig";

/**
 * Public off-season gate for Spring leagues only.
 *
 * Gonzales DYB and Ascension LL hide last season's operational pages once
 * `isSeasonLiveForOrg` is false. Fall Ball, district/tournament deployments,
 * and master admin never take this path — including when Fall Ball itself
 * is outside its window.
 */
export const SPRING_CONTENT_ORGS = ["gonzales", "ascension"] as const;

export type SpringContentOrgId = (typeof SPRING_CONTENT_ORGS)[number];

export type PublicRegistrationStatus = "OPEN" | "WAITLIST" | "CLOSED";

export type PublicSeasonSurface =
  | "rosters"
  | "schedule"
  | "upcomingGames"
  | "scoreboard"
  | "standings";

/** `live` means render the existing in-season UI. */
export type PublicSurfaceVisibility = "hidden" | "live" | "final";

/**
 * `before` — calendar day is earlier than the configured start.
 * `live` — inside the window.
 * `after` — calendar day is later than the configured end.
 */
export type SpringPublicPhase = "before" | "live" | "after";

/** A season that has already finished, supplied from existing schedule data. */
export type CompletedSeasonRecord = {
  label: string;
  /** ISO date YYYY-MM-DD */
  endDate?: string | null;
  year?: number | null;
};

export function isSpringContentOrg(
  org: string | null | undefined,
): org is SpringContentOrgId {
  return org === "gonzales" || org === "ascension";
}

export function springPublicPhase(
  org: string | null | undefined,
  asOf: Date = new Date(),
): SpringPublicPhase | null {
  if (!isSpringContentOrg(org)) return null;
  const season = getSeasonConfigForOrg(org);
  const day = leagueCalendarDate(asOf);
  if (day < season.startDate) return "before";
  if (day > season.endDate) return "after";
  return "live";
}

export function isSpringPublicOffSeason(
  org: string | null | undefined,
  asOf: Date = new Date(),
): boolean {
  const phase = springPublicPhase(org, asOf);
  return phase === "before" || phase === "after";
}

export function publicSurfaceVisibility(
  org: string | null | undefined,
  surface: PublicSeasonSurface,
  asOf: Date = new Date(),
  completedSeasons?: readonly CompletedSeasonRecord[] | null,
): PublicSurfaceVisibility {
  if (!isSpringPublicOffSeason(org, asOf)) return "live";
  if (surface === "standings") {
    return isSpringContentOrg(org) && finalStandingsLabel(org, asOf, completedSeasons)
      ? "final"
      : "hidden";
  }
  return "hidden";
}

export function getSeasonLabel(org: SpringContentOrgId): string {
  return getSeasonConfigForOrg(org).label;
}

export function formatPublicSeasonDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map((part) => Number(part));
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function nextSpringSeasonLabel(org: SpringContentOrgId): string {
  const season = getSeasonConfigForOrg(org);
  const prefix = season.label.replace(/\s*\d{4}\s*$/, "").trim() || "Spring";
  return `${prefix} ${season.year + 1}`;
}

/**
 * After the window, the configured season is the completed one.
 * Before the window, use the most recent completed season in `completedSeasons`.
 * Returns null when there is nothing finished to label, including while the season is live.
 */
export function finalStandingsLabel(
  org: SpringContentOrgId,
  asOf: Date = new Date(),
  completedSeasons?: readonly CompletedSeasonRecord[] | null,
): string | null {
  const phase = springPublicPhase(org, asOf);
  if (phase === "after") return `${getSeasonLabel(org)} Final Standings`;
  if (phase !== "before") return null;
  const completed = mostRecentCompletedSeasonLabel(org, asOf, completedSeasons);
  return completed ? `${completed} Final Standings` : null;
}

export function mostRecentCompletedSeasonLabel(
  org: SpringContentOrgId,
  asOf: Date = new Date(),
  completedSeasons?: readonly CompletedSeasonRecord[] | null,
): string | null {
  const config = getSeasonConfigForOrg(org);
  const day = leagueCalendarDate(asOf);
  const ranked = (completedSeasons ?? [])
    .map((season) => ({
      label: season.label.trim(),
      endDate: season.endDate?.trim() || null,
      year: season.year ?? null,
    }))
    .filter((season) => {
      if (!season.label) return false;
      if (season.year != null && season.year >= config.year) return false;
      if (season.label === config.label && season.year == null) return false;
      if (season.endDate && season.endDate >= day) return false;
      if (season.endDate && season.endDate >= config.startDate) return false;
      return true;
    })
    .sort((left, right) => {
      const leftKey = left.endDate ?? `${String(left.year ?? 0).padStart(4, "0")}-12-31`;
      const rightKey = right.endDate ?? `${String(right.year ?? 0).padStart(4, "0")}-12-31`;
      return rightKey.localeCompare(leftKey);
    });
  return ranked[0]?.label ?? null;
}

export function offSeasonSeasonInfoMessage(
  org: SpringContentOrgId,
  asOf: Date = new Date(),
): string {
  const season = getSeasonConfigForOrg(org);
  if (leagueCalendarDate(asOf) < season.startDate) {
    return `${season.label} season info will appear here once the season begins on ${formatPublicSeasonDate(season.startDate)}.`;
  }
  return `${nextSpringSeasonLabel(org)} season info will appear here once the season begins.`;
}

export function registrationOffSeasonCopy(
  status: PublicRegistrationStatus | null | undefined,
): { statusText: string; actionLabel: string } {
  if (status === "OPEN") {
    return { statusText: "Registration is open.", actionLabel: "Register Now" };
  }
  if (status === "WAITLIST") {
    return {
      statusText: "The waitlist is open.",
      actionLabel: "Join the Waitlist",
    };
  }
  if (status === "CLOSED") {
    return {
      statusText: "Registration is currently closed.",
      actionLabel: "View registration",
    };
  }
  return { statusText: "", actionLabel: "Registration" };
}

const HIDDEN_PUBLIC_PATHS = new Set(["/schedule", "/rosters", "/today"]);

type NavLink = { href: string; label: string; key?: string };

function navPath(href: string): string {
  return href.split(/[?#]/)[0] || href;
}

/**
 * Drop operational links. Add Final Standings only when a completed season exists.
 * Pass null before opening day when no finished season is in the data.
 */
export function springOffSeasonPublicNav<T extends NavLink>(
  links: readonly T[],
  standingsLabel?: string | null,
): Array<T | NavLink> {
  const kept = links.filter((link) => !HIDDEN_PUBLIC_PATHS.has(navPath(link.href)));
  if (!standingsLabel) return [...kept];
  if (kept.some((link) => navPath(link.href) === "/standings")) return [...kept];
  return [{ href: "/standings", label: "Final Standings", key: "standings" }, ...kept];
}

/**
 * Returns the same array when the org is in season, Fall Ball, or not a Spring league.
 */
export function applySpringOffSeasonNav<T extends NavLink>(
  links: readonly T[],
  org: string | null | undefined,
  asOf: Date = new Date(),
  completedSeasons?: readonly CompletedSeasonRecord[] | null,
): readonly T[] | Array<T | NavLink> {
  if (!isSpringPublicOffSeason(org, asOf) || !isSpringContentOrg(org)) return links;
  return springOffSeasonPublicNav(links, finalStandingsLabel(org, asOf, completedSeasons));
}

export function suppressPublicLiveScoreboard<T extends { gameChanger?: unknown }>(
  bracket: T,
  org: string | null | undefined,
  asOf: Date = new Date(),
): T {
  if (!isSpringPublicOffSeason(org, asOf)) return bracket;
  if (bracket.gameChanger == null) return bracket;
  return { ...bracket, gameChanger: null };
}
