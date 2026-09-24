import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import type { ContentOrgId } from "@/lib/siteConfig";

export type SeasonDashboardLinks = {
  scores: string;
  umpirePay: string | null;
  assignr: string | null;
  enrollment: string | null;
  scheduler: string | null;
  sportsConnect: string | null;
  teams: string | null;
  tournamentIncome: string | null;
};

export function seasonDashboardLinks(
  org: ContentOrgId,
  role: AdminRole,
): SeasonDashboardLinks {
  const query = `?org=${org}`;
  return {
    scores: `/admin/scores${query}`,
    umpirePay: canAccessAdminModule(role, "REPORTS")
      ? `/admin/reports/umpire-pay${query}`
      : null,
    assignr: canAccessAdminModule(role, "ASSIGNR") ? `/admin/assignr${query}` : null,
    enrollment: canAccessAdminModule(role, "ENROLLMENT_KPI")
      ? `/admin/enrollment${query}`
      : null,
    scheduler: canAccessAdminModule(role, "TEAMS") ? `/admin/scheduler${query}` : null,
    sportsConnect: canAccessAdminModule(role, "TEAMS")
      ? `/admin/sports-connect${query}`
      : null,
    teams: canAccessAdminModule(role, "TEAMS") ? `/admin/teams${query}` : null,
    tournamentIncome: canAccessAdminModule(role, "REPORTS")
      ? "/admin/reports/tournament-income"
      : null,
  };
}
