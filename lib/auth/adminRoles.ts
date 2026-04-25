export const ADMIN_ROLES = [
  "MASTER_ADMIN",
  "ADMIN",
  "BOARD_MEMBER",
  "PARK_DIRECTOR",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_MODULES = [
  "DASHBOARD",
  "USERS",
  "REPORTS",
  "SCORES",
  "DUGOUT_MODERATION",
  "NEWS_ADMIN",
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
  REPORTS: "PARK_DIRECTOR",
  SCORES: "BOARD_MEMBER",
  DUGOUT_MODERATION: "BOARD_MEMBER",
  NEWS_ADMIN: "BOARD_MEMBER",
};

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

export function getMinimumRoleForModule(module: AdminModule): AdminRole {
  return moduleMinimumRole[module];
}

export function canAccessAdminModule(
  role: AdminRole,
  module: AdminModule,
): boolean {
  return hasAdminRoleAtLeast(role, getMinimumRoleForModule(module));
}

export function getAdminRoleLabel(role: AdminRole): string {
  if (role === "MASTER_ADMIN") return "Master Admin";
  if (role === "BOARD_MEMBER") return "Board Member";
  if (role === "PARK_DIRECTOR") return "Park Director";
  return "Admin";
}
