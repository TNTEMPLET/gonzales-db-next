import type { AdminRole } from "@/lib/auth/adminRoles";
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

/** Bare /admin, including an org query, is the dashboard. Any other path is explicit. */
export function isDefaultAdminHome(nextPath: string): boolean {
  const path = (nextPath.split("?")[0] ?? "/admin").replace(/\/+$/, "") || "/";
  return path === "/admin";
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

/** Where a successful sign-in goes when the caller already knows the landing decision. */
export function pathAfterAdminLogin(input: {
  nextPath: string;
  landsOnGameDay: boolean;
  /** Pass null when the director has no membership org. Omitted uses the next-path org. */
  org?: string | null;
}): string {
  if (!input.landsOnGameDay || !isDefaultAdminHome(input.nextPath)) return input.nextPath;
  const org = input.org === undefined ? orgFromAdminNext(input.nextPath) : input.org;
  return gameDayHomePath(org);
}
