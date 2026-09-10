import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import EnrollmentKpiHub from "@/components/admin/enrollment/EnrollmentKpiHub";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import ReportOrgPicker from "@/components/admin/ReportOrgPicker";
import { parseReportContentOrg } from "@/lib/admin/reportOrg";
import {
  getDefaultContentOrg,
  getOrgDisplayName,
  getSiteConfig,
  isMasterDeployment,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Enrollment & KPIs | ${site.name}`,
    description: "Registration counts, revenue collected vs. outstanding, fee-tier breakdown, and team rosters at a glance.",
  };
}

export default async function EnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const selectedOrg = parseReportContentOrg(org) ?? (isMasterDeployment() ? null : getDefaultContentOrg());
  const currentOrg = selectedOrg ?? resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=/admin/enrollment${org ? `?org=${org}` : ""}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  if (!canAccessAdminModule(role, "ENROLLMENT_KPI")) {
    redirect("/admin?denied=enrollment");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ENROLLMENT & KPIS"
            currentOrg={selectedOrg}
            currentPath="/admin/enrollment"
            orgSwitcherShowAllSites={false}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Enrollment & KPIs</h1>
          <p className="max-w-3xl text-zinc-400">
            Registration counts, revenue collected vs. outstanding, fee-tier breakdown, and team
            rosters for one organization.
          </p>
        </div>

        {selectedOrg ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
            <p className="mb-4 text-sm text-zinc-300">
              Showing <span className="font-semibold text-white">{getOrgDisplayName(selectedOrg)}</span> only.
            </p>
            <EnrollmentKpiHub targetOrg={selectedOrg} />
          </div>
        ) : (
          <ReportOrgPicker path="/admin/enrollment" title="Enrollment & KPIs" />
        )}
      </section>
    </main>
  );
}
