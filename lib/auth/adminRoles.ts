import { isMasterDeployment } from "@/lib/siteConfig";

export const ADMIN_ROLES = [
  "MASTER_ADMIN",
  "ADMIN",
  "BOARD_MEMBER",
  "PARK_DIRECTOR",
] as const;

export const PROTECTED_MASTER_ADMIN_EMAIL = "trent@apbaseball.com";

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_MODULES = [
  "DASHBOARD",
  "USERS",
  "VOLUNTEERS",
  "TEAMS",
  "SPONSORS",
  "REPORTS",
  "SCORES",
  "DUGOUT_MODERATION",
  "NEWS_ADMIN",
  "ALL_STAR_VAULT",
  "ALL_STAR_PAYMENTS",
  "COMMUNICATIONS",
  "SOCIAL_MEDIA",
  "ORG_DOCUMENTS",
  "ASSIGNR",
  "TOURNAMENT_BRACKETS",
  "TOURNAMENT_ALERTS",
  "PARK_ALERTS",
  "PARK_INFO",
  "ROLE_ASSIGNMENT",
] as const;

export type AdminModule = (typeof ADMIN_MODULES)[number];

const roleRank: Record<AdminRole, number> = {
  MASTER_ADMIN: 5,
  ADMIN: 4,
  BOARD_MEMBER: 3,
  PARK_DIRECTOR: 2,
};

const moduleMinimumRole: Record<AdminModule, AdminRole> = {
  DASHBOARD: "PARK_DIRECTOR",
  USERS: "ADMIN",
  VOLUNTEERS: "ADMIN",
  TEAMS: "ADMIN",
  SPONSORS: "ADMIN",
  REPORTS: "PARK_DIRECTOR",
  SCORES: "BOARD_MEMBER",
  DUGOUT_MODERATION: "BOARD_MEMBER",
  NEWS_ADMIN: "BOARD_MEMBER",
  ALL_STAR_VAULT: "ADMIN",
  ALL_STAR_PAYMENTS: "BOARD_MEMBER",
  COMMUNICATIONS: "ADMIN",
  SOCIAL_MEDIA: "BOARD_MEMBER",
  ORG_DOCUMENTS: "BOARD_MEMBER",
  ASSIGNR: "ADMIN",
  TOURNAMENT_BRACKETS: "MASTER_ADMIN",
  TOURNAMENT_ALERTS: "MASTER_ADMIN",
  PARK_ALERTS: "ADMIN",
  PARK_INFO: "ADMIN",
  ROLE_ASSIGNMENT: "MASTER_ADMIN",
};

const MASTER_ONLY_MODULES = new Set<AdminModule>([
  "SPONSORS",
  "NEWS_ADMIN",
  "SOCIAL_MEDIA",
  "ORG_DOCUMENTS",
  "TOURNAMENT_BRACKETS",
  "TOURNAMENT_ALERTS",
  "PARK_INFO",
  "ROLE_ASSIGNMENT",
]);

export function isAdminRole(
  value: string | null | undefined,
): value is AdminRole {
  if (!value) return false;
  return ADMIN_ROLES.includes(value as AdminRole);
}

export function toAdminRole(
  role: string | null | undefined,
  isMasterFlag = false,
): AdminRole {
  if (isMasterFlag) return "MASTER_ADMIN";
  if (isAdminRole(role)) return role;
  return "ADMIN";
}

export function hasAdminRoleAtLeast(
  role: AdminRole,
  minimum: AdminRole,
): boolean {
  return roleRank[role] >= roleRank[minimum];
}

/** Highest role by authority (rank). Useful when aggregating org memberships onto AdminUser.role. */
export function getHighestAdminRole(roles: AdminRole[]): AdminRole {
  if (roles.length === 0) return "PARK_DIRECTOR";
  return roles.reduce((best, r) =>
    roleRank[r] > roleRank[best] ? r : best,
  );
}

/** Roles that organization-site admins may assign (everything else is Master Admin only). */
export function isAssignableOnlyOnMasterSite(role: AdminRole): boolean {
  return role === "BOARD_MEMBER" || role === "PARK_DIRECTOR";
}

export function getMinimumRoleForModule(module: AdminModule): AdminRole {
  return moduleMinimumRole[module];
}

export function canAccessAdminModule(
  role: AdminRole,
  module: AdminModule,
): boolean {
  if (MASTER_ONLY_MODULES.has(module) && !isMasterDeployment()) {
    return false;
  }
  return hasAdminRoleAtLeast(role, getMinimumRoleForModule(module));
}

export function getAdminRoleLabel(role: AdminRole): string {
  if (role === "MASTER_ADMIN") return "Master Admin";
  if (role === "BOARD_MEMBER") return "Board Member";
  if (role === "PARK_DIRECTOR") return "Park Director";
  return "Admin";
}

/**
 * Suggest the least-privilege AdminRole for a set of desired modules.
 * Used by the Role Assignment console to guide Master Admins.
 */
export function suggestLeastPrivilegeRole(
  desiredModules: AdminModule[],
): { role: AdminRole; notes: string } {
  if (!desiredModules || desiredModules.length === 0) {
    return {
      role: "PARK_DIRECTOR",
      notes: "Minimal access. Good for read-only oversight (reports + basic dashboard).",
    };
  }

  const needsMaster = desiredModules.some((m) =>
    ["TOURNAMENT_BRACKETS", "TOURNAMENT_ALERTS", "ROLE_ASSIGNMENT"].includes(m),
  );
  if (needsMaster) {
    return {
      role: "MASTER_ADMIN",
      notes: "Requires platform-level privileges. Only for trusted cross-org operators.",
    };
  }

  const needsBoard = desiredModules.some((m) =>
    [
      "SCORES",
      "DUGOUT_MODERATION",
      "NEWS_ADMIN",
      "ALL_STAR_PAYMENTS",
      "SOCIAL_MEDIA",
      "ORG_DOCUMENTS",
    ].includes(m),
  );
  if (needsBoard) {
    return {
      role: "BOARD_MEMBER",
      notes: "Elevated operational + publishing/moderation. Use when scores, moderation, or payments oversight is required.",
    };
  }

  // Default for day-to-day league work (teams, users, volunteers, comms, assignr, etc.)
  return {
    role: "ADMIN",
    notes: "Site-level operator. Preferred for most league staff. Grant per-organization via AdminOrgMembership.",
  };
}
