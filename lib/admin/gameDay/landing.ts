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

/** Where a successful sign-in goes when the caller already knows the landing decision. */
export function pathAfterAdminLogin(input: {
  nextPath: string;
  landsOnGameDay: boolean;
  org?: string | null;
}): string {
  if (!input.landsOnGameDay || !isDefaultAdminHome(input.nextPath)) return input.nextPath;
  return gameDayHomePath(input.org ?? orgFromAdminNext(input.nextPath));
}
