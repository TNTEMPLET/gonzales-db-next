import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";

/**
 * Role used for a field-desk or scoreboard write.
 * The game's own league role wins. A park director signed in on another league
 * may still write when they have an active park assignment; the venue check
 * then decides which game. No assignment keeps the old league-only rule.
 */
export function fieldDeskAuthRole(input: {
  roleOnGameOrg: AdminRole | null;
  siteRole: AdminRole | null;
  hasActiveAssignments: boolean;
}): AdminRole | null {
  if (input.roleOnGameOrg && canAccessAdminModule(input.roleOnGameOrg, "GAME_DAY")) {
    return input.roleOnGameOrg;
  }
  if (
    input.hasActiveAssignments &&
    input.siteRole === "PARK_DIRECTOR" &&
    canAccessAdminModule(input.siteRole, "GAME_DAY")
  ) {
    return "PARK_DIRECTOR";
  }
  return null;
}
