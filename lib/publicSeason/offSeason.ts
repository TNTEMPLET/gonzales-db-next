import {
  getSeasonConfigForOrg,
  isSeasonLiveForOrg,
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

export function isSpringContentOrg(
  org: string | null | undefined,
): org is SpringContentOrgId {
  return org === "gonzales" || org === "ascension";
}

export function isSpringPublicOffSeason(
  org: string | null | undefined,
  asOf: Date = new Date(),
): boolean {
  if (!isSpringContentOrg(org)) return false;
  return !isSeasonLiveForOrg(org, asOf);
}

export function publicSurfaceVisibility(
  org: string | null | undefined,
  surface: PublicSeasonSurface,
  asOf: Date = new Date(),
): PublicSurfaceVisibility {
  if (!isSpringPublicOffSeason(org, asOf)) return "live";
  if (surface === "standings") return "final";
  return "hidden";
}

export function getSeasonLabel(org: SpringContentOrgId): string {
  return getSeasonConfigForOrg(org).label;
}

export function finalStandingsLabel(org: SpringContentOrgId): string {
  return `${getSeasonLabel(org)} Final Standings`;
}

export function nextSpringSeasonLabel(org: SpringContentOrgId): string {
  const season = getSeasonConfigForOrg(org);
  const prefix = season.label.replace(/\s*\d{4}\s*$/, "").trim() || "Spring";
  return `${prefix} ${season.year + 1}`;
}

export function offSeasonSeasonInfoMessage(org: SpringContentOrgId): string {
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

/** Drop operational links and point people at final standings. */
export function springOffSeasonPublicNav<T extends NavLink>(
  links: readonly T[],
): Array<T | NavLink> {
  const kept = links.filter((link) => !HIDDEN_PUBLIC_PATHS.has(navPath(link.href)));
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
): readonly T[] | Array<T | NavLink> {
  if (!isSpringPublicOffSeason(org, asOf)) return links;
  return springOffSeasonPublicNav(links);
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
