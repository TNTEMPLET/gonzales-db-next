import type { AdminRole } from "@/lib/auth/adminRoles";
import { isSetupSeasonMode, type SeasonMode } from "@/lib/season/mode";
import { isContentOrgId } from "@/lib/siteConfig";

/**
 * True when this sign-in site has only Park Director memberships.
 * Masters never land on Game Day. A higher role on the site keeps the dashboard.
 */
export function landsOnGameDay(input: {
  isMaster: boolean;
  rolesOnSite: readonly (AdminRole | null)[];
}): boolean {
  if (input.isMaster) return false;
  const held = input.rolesOnSite.filter((role): role is AdminRole => role != null);
  if (held.length === 0) return false;
  return held.every((role) => role === "PARK_DIRECTOR");
}

/** Query that opens the module grid and skips the season-home redirect. */
export const ADMIN_DASHBOARD_VIEW = "dashboard";

/**
 * True when this URL asks to stay on the dashboard.
 * Login and the org switcher omit it, so bare /admin still follows the season.
 */
export function isExplicitDashboardView(nextPath: string): boolean {
  const query = nextPath.split("?")[1];
  if (!query) return false;
  return new URLSearchParams(query).get("view") === ADMIN_DASHBOARD_VIEW;
}

/** Keep org (and any other query) and mark the link as an explicit dashboard open. */
export function withDashboardView(href: string): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("view", ADMIN_DASHBOARD_VIEW);
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}

/**
 * Bare /admin, including an org query, is the season-aware home.
 * ?view=dashboard is an explicit request for the module grid, so it is not that home.
 */
export function isDefaultAdminHome(nextPath: string): boolean {
  const path = (nextPath.split("?")[0] ?? "/admin").replace(/\/+$/, "") || "/";
  if (path !== "/admin") return false;
  return !isExplicitDashboardView(nextPath);
}

export function orgFromAdminNext(nextPath: string): string | null {
  const query = nextPath.split("?")[1];
  if (!query) return null;
  const org = new URLSearchParams(query).get("org")?.trim() ?? "";
  return org || null;
}

export function gameDayHomePath(org?: string | null): string {
  if (org && isContentOrgId(org)) return `/admin/game-day?org=${encodeURIComponent(org)}`;
  return "/admin/game-day";
}

/**
 * Org a park-director-only user may open.
 * A requested org counts only when it is one of their memberships.
 * Otherwise the first membership. Never an arbitrary live org.
 */
export function directorGameDayOrg(input: {
  requestedOrg: string | null | undefined;
  membershipOrgs: readonly string[];
}): string | null {
  const membership = input.membershipOrgs.filter((org) => isContentOrgId(org));
  const requested = input.requestedOrg?.trim() ?? "";
  if (requested && isContentOrgId(requested) && membership.includes(requested)) return requested;
  return membership[0] ?? null;
}

/**
 * Where to send someone who cannot open this org's Game Day.
 * A sole park director must not go to /admin: that page sends them back here.
 * Null means stay on this page and show the refusal.
 */
export function deniedGameDayRedirect(input: {
  soleDirector: boolean;
  membershipOrg: string | null;
  currentOrg: string;
}): string | null {
  if (!input.soleDirector) return "/admin?denied=game-day";
  if (
    input.membershipOrg &&
    isContentOrgId(input.membershipOrg) &&
    input.membershipOrg !== input.currentOrg
  ) {
    return gameDayHomePath(input.membershipOrg);
  }
  return null;
}

/**
 * Content org for a bare /admin Season Setup redirect.
 * `all` and `spring` stay put: all sites has no single mode, and spring still
 * goes to Gonzales before that league's mode applies. A path with no org uses
 * the explicit org (league sites). A bare master /admin passes neither.
 */
function contentOrgForSeasonHome(input: {
  nextPath: string;
  org?: string | null;
}): string | null {
  const fromPath = orgFromAdminNext(input.nextPath);
  if (fromPath === "all" || fromPath === "spring") return null;
  if (fromPath) return isContentOrgId(fromPath) ? fromPath : null;
  if (input.org && isContentOrgId(input.org)) return input.org;
  return null;
}

/** Where a successful sign-in goes when the caller already knows the landing decision. */
export function pathAfterAdminLogin(input: {
  nextPath: string;
  landsOnGameDay: boolean;
  /** Pass null when the director has no membership org. Omitted uses the next-path org. */
  org?: string | null;
  /**
   * Resolved mode for this visit. Omitted or null keeps today's path
   * (no Season Setup redirect). An override is just this value.
   */
  seasonMode?: SeasonMode | null;
}): string {
  if (!isDefaultAdminHome(input.nextPath)) return input.nextPath;
  if (input.landsOnGameDay) {
    const org = input.org === undefined ? orgFromAdminNext(input.nextPath) : input.org;
    return gameDayHomePath(org);
  }
  if (!isSetupSeasonMode(input.seasonMode)) return input.nextPath;
  const org = contentOrgForSeasonHome(input);
  if (!org) return input.nextPath;
  return `/admin/season-setup?org=${encodeURIComponent(org)}`;
}
