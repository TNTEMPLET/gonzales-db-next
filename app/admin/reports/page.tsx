import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminReportsHub from "@/components/admin/AdminReportsHub";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { canSeeReportsHub, reportsForRole } from "@/lib/admin/reportCatalog";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { isAllSitesReportRequest } from "@/lib/admin/reportOrg";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Reports | ${site.name}`,
    description: "Open umpire pay, tournament income, enrollment, jersey, and schedule reports.",
  };
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const allSites = isAllSitesReportRequest(org);
  const orgId = resolveAdminTargetOrg(org);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=/admin/reports?org=${orgId}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    orgId,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  const allowModule = (module: Parameters<typeof canAccessAdminModule>[1]) =>
    canAccessAdminModule(role, module);
  if (!canSeeReportsHub(allowModule)) {
    redirect("/admin?denied=reports");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="REPORTING"
            currentOrg={allSites ? null : orgId}
            currentPath="/admin/reports"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Reports</h1>
          <p className="max-w-2xl text-zinc-400">
            Every report you can generate lives here. Open one to run it, download a file, or send
            it. Money reports stay on one organization at a time — Gonzales, Ascension, or Fall Ball.
          </p>
        </div>

        <AdminReportsHub org={orgId} allSites={allSites} cards={reportsForRole(allowModule)} />
      </section>
    </main>
  );
}
