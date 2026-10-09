import type { AdminRole } from "@/lib/auth/adminRoles";
import type { ContentOrgId } from "@/lib/siteConfig";

import { decideRainoutWrite } from "./writeAccess";

/**
 * Dashboard "View by role" values. Matches `AdminViewPreviewRole`.
 * Resolved in the browser by `readAdminViewPreviewRole`.
 */
export type DashboardRainoutPreviewRole =
  | "NONE"
  | "ADMIN"
  | "BOARD_MEMBER"
  | "PARK_DIRECTOR"
  | "ALL_STAR_VIEW_ONLY";

/**
 * Live game-day rainout flags from the signed-in role.
 * A role preview does not belong here: the server never sees it.
 */
export function canWriteRainoutByOrgFromRoles(input: {
  orgs: readonly ContentOrgId[];
  isMaster: boolean;
  roleByOrg: Partial<Record<ContentOrgId, AdminRole | null>>;
}): Partial<Record<ContentOrgId, boolean>> {
  return Object.fromEntries(
    input.orgs.map((orgId) => [
      orgId,
      decideRainoutWrite({
        isMaster: input.isMaster,
        role: input.roleByOrg[orgId] ?? null,
        path: "game-day",
      }).allowed,
    ]),
  );
}

function previewedRainoutRole(
  previewRole: DashboardRainoutPreviewRole,
): AdminRole | null | "live" {
  switch (previewRole) {
    case "NONE":
      return "live";
    case "ADMIN":
    case "BOARD_MEMBER":
    case "PARK_DIRECTOR":
      return previewRole;
    case "ALL_STAR_VIEW_ONLY":
      return null;
    default: {
      const unexpected: never = previewRole;
      return unexpected;
    }
  }
}

/**
 * UI-only game-day write flag.
 *
 * No preview keeps the live flag. An active preview is judged with
 * `decideRainoutWrite` on the game-day path and is not a master grant, so a
 * master admin previewing as Park Director loses set, clear, and preview-email
 * controls. Server actions still authorize the signed-in role.
 */
export function gameDayRainoutWriteForPreview(input: {
  previewRole: DashboardRainoutPreviewRole;
  liveAllowed: boolean;
}): boolean {
  const role = previewedRainoutRole(input.previewRole);
  if (role === "live") return input.liveAllowed;
  return decideRainoutWrite({
    isMaster: false,
    role,
    path: "game-day",
  }).allowed;
}

/** Per-org UI flags. Missing preview roles stay on the live flag. */
export function canWriteRainoutByOrgForPreview(input: {
  liveByOrg: Partial<Record<ContentOrgId, boolean>>;
  previewRoleByOrg: Partial<Record<ContentOrgId, DashboardRainoutPreviewRole>>;
}): Partial<Record<ContentOrgId, boolean>> {
  return Object.fromEntries(
    (Object.keys(input.liveByOrg) as ContentOrgId[]).map((orgId) => [
      orgId,
      gameDayRainoutWriteForPreview({
        previewRole: input.previewRoleByOrg[orgId] ?? "NONE",
        liveAllowed: input.liveByOrg[orgId] === true,
      }),
    ]),
  );
}
