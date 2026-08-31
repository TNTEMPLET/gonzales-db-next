import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminAlertsManager from "@/components/admin/AdminAlertsManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import TournamentAlertsPanel from "@/components/admin/TournamentAlertsPanel";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getAllActiveOrgAlerts } from "@/lib/orgAlerts";
import {
  CONTENT_ORGS,
  getSiteConfig,
  getSiteConfigForOrg,
  isMasterDeployment,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Park & Tournament Alerts | ${site.name}`,
    description: "Monitor alert provider status and issue automatic or manual rainout alerts.",
  };
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=/admin/alerts?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  const canAlerts =
    canAccessAdminModule(role, "PARK_ALERTS") || canAccessAdminModule(role, "TOURNAMENT_ALERTS");
  if (!canAlerts) {
    redirect("/admin?denied=alerts");
  }

  const masterMode = isMasterDeployment();
  const activeAlerts = masterMode
    ? await getAllActiveOrgAlerts()
    : (await getAllActiveOrgAlerts()).filter((a) => a.organizationId === currentOrg);
  const availableOrgs = masterMode
    ? CONTENT_ORGS.map((id) => ({ id, name: getSiteConfigForOrg(id).name }))
    : [{ id: currentOrg, name: getSiteConfigForOrg(currentOrg).name }];

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="PARK & TOURNAMENT ALERTS"
            currentOrg={currentOrg}
            currentPath={`/admin/alerts?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Park & Tournament Alerts
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Monitor alert provider status and issue automatic or manual rainout alerts.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6 space-y-8">
          <AdminAlertsManager
            activeAlerts={activeAlerts}
            availableOrgs={availableOrgs}
            defaultOrg={currentOrg}
          />
          <TournamentAlertsPanel />
        </div>
      </section>
    </main>
  );
}
