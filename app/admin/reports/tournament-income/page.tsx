import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import TournamentIncomeReportManager from "@/components/admin/TournamentIncomeReportManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import {
  canAccessAdminModule,
  hasAdminRoleAtLeast,
  toAdminRole,
} from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import {
  BRACKET_ORGS,
  getSiteConfig,
  isBracketOrgId,
  isContentOrgId,
  type BracketOrgId,
} from "@/lib/siteConfig";

const DEFAULT_REPORT_ORG: BracketOrgId = "ladistrict6";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Tournament Income | ${site.name}`,
    description: "Review tournament PayPal income and export treasurer-ready totals.",
  };
}

export default async function TournamentIncomeReportPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const reportOrg = isBracketOrgId(org) ? org : DEFAULT_REPORT_ORG;
  const authOrg = isContentOrgId(reportOrg) ? reportOrg : "gonzales";

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(
      `/admin/login?next=${encodeURIComponent(
        `/admin/reports/tournament-income?org=${reportOrg}`,
      )}`,
    );
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    authOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  if (!canAccessAdminModule(role, "REPORTS")) {
    redirect("/admin?denied=reports");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="TOURNAMENT INCOME"
            currentOrg={reportOrg}
            orgSwitcherOrgs={BRACKET_ORGS}
            currentPath="/admin/reports/tournament-income"
            orgSwitcherShowAllSites={false}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Tournament Income Report
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Review District tournament PayPal income, flag payments that need
            review, and export a clean CSV for the treasurer.
          </p>
        </div>

        <TournamentIncomeReportManager initialOrg={reportOrg} />
      </section>
    </main>
  );
}
