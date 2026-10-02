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
  "REGISTRATION_WINDOWS",
  "DRAFT",
  "ENROLLMENT_KPI",
  "SEASON_SETUP",
  "SURVEYS",
  "SCHEDULER",
  "SPORTS_CONNECT",
  "ORDERS",
  "GAME_DAY",
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
  SCORES: "PARK_DIRECTOR",
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
  REGISTRATION_WINDOWS: "MASTER_ADMIN",
  DRAFT: "ADMIN",
  ENROLLMENT_KPI: "BOARD_MEMBER",
  SEASON_SETUP: "PARK_DIRECTOR",
  SURVEYS: "ADMIN",
  SCHEDULER: "ADMIN",
  SPORTS_CONNECT: "ADMIN",
  ORDERS: "BOARD_MEMBER",
  GAME_DAY: "PARK_DIRECTOR",
};

const ADMIN_MODULE_LABELS: Record<AdminModule, string> = {
  DASHBOARD: "Dashboard",
  USERS: "Directory",
  VOLUNTEERS: "Volunteer cards",
  TEAMS: "Teams and rosters",
  SPONSORS: "Sponsors",
  REPORTS: "Reports and umpire pay",
  SCORES: "Scores and standings",
  DUGOUT_MODERATION: "Dugout moderation",
  NEWS_ADMIN: "News publishing",
  ALL_STAR_VAULT: "All-Star vault",
  ALL_STAR_PAYMENTS: "All-Star payments",
  COMMUNICATIONS: "Communications",
  SOCIAL_MEDIA: "Social media",
  ORG_DOCUMENTS: "Org documents",
  ASSIGNR: "Umpire desk (Assignr)",
  TOURNAMENT_BRACKETS: "Tournament brackets",
  TOURNAMENT_ALERTS: "Tournament alerts",
  PARK_ALERTS: "Park alerts",
  PARK_INFO: "Park info",
  ROLE_ASSIGNMENT: "Role assignment",
  REGISTRATION_WINDOWS: "Registration windows",
  DRAFT: "Online draft",
  ENROLLMENT_KPI: "Enrollment and KPIs",
  SEASON_SETUP: "Season setup",
  SURVEYS: "Surveys",
  SCHEDULER: "Scheduler",
  SPORTS_CONNECT: "Sports Connect import",
  ORDERS: "Cap and shirt orders",
  GAME_DAY: "Game day and field desk",
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
  "REGISTRATION_WINDOWS",
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

/**
 * Resolve a non-null AdminRole for authorization/display.
 * Under the better model:
 *   - isMaster → MASTER_ADMIN
 *   - has explicit per-org role → that role
 *   - otherwise → PARK_DIRECTOR (lowest) as a safe default for UI,
 *     while real access should be denied earlier via ensureAdminModule.
 */
export function resolveAdminRole(
  isMaster: boolean,
  perOrgRole: AdminRole | null | undefined,
): AdminRole {
  if (isMaster) return "MASTER_ADMIN";
  if (perOrgRole) return perOrgRole;
  return "PARK_DIRECTOR";
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

export function getAdminModuleLabel(module: AdminModule): string {
  return ADMIN_MODULE_LABELS[module];
}

export function canAccessAdminModule(
  role: AdminRole,
  module: AdminModule,
): boolean {
  if (role === "MASTER_ADMIN") {
    return true;
  }
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

const ROLE_SUGGESTION_NOTES: Record<AdminRole, string> = {
  PARK_DIRECTOR:
    "Game day, scores, umpire pay, and season setup. Park directors do not see cap or shirt orders.",
  BOARD_MEMBER:
    "Board access, including cap and shirt orders, moderation, and payments oversight. Surveys, the scheduler, and Sports Connect stay with admins.",
  ADMIN:
    "Site operator. Includes surveys, the scheduler, Sports Connect, teams, and everything a board member can open.",
  MASTER_ADMIN:
    "Requires platform-level privileges. Only for trusted cross-org operators.",
};

/**
 * Suggest the least-privilege AdminRole for a set of desired modules.
 * The suggestion is the highest minimum role among those modules.
 * Used by the Role Assignment console to guide Master Admins.
 */
export function suggestLeastPrivilegeRole(
  desiredModules: AdminModule[],
): { role: AdminRole; notes: string } {
  if (!desiredModules || desiredModules.length === 0) {
    return {
      role: "PARK_DIRECTOR",
      notes: ROLE_SUGGESTION_NOTES.PARK_DIRECTOR,
    };
  }

  let role: AdminRole = "PARK_DIRECTOR";
  for (const module of desiredModules) {
    const minimum = getMinimumRoleForModule(module);
    if (roleRank[minimum] > roleRank[role]) role = minimum;
  }

  return { role, notes: ROLE_SUGGESTION_NOTES[role] };
}
