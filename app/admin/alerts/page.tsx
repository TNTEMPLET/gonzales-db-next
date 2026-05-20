import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminAlertsManager from "@/components/admin/AdminAlertsManager";
import {
  CONTENT_ORGS,
  getSiteConfig,
  getSiteConfigForOrg,
  isMasterDeployment,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";
import { getAllActiveOrgAlerts } from "@/lib/orgAlerts";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Park Alerts | ${site.name}`,
    description: "Post and manage rainout alerts shown on the public site.",
  };
}

export default async function AdminAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const masterMode = isMasterDeployment();

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/alerts");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "PARK_ALERTS")) {
    redirect("/admin?denied=park-alerts");
  }

  const allowRolePreview = hasAdminRoleAtLeast(role, "ADMIN");

  // On master: show alerts for all orgs. On per-org: only current org.
  const activeAlerts = masterMode
    ? await getAllActiveOrgAlerts()
    : (await getAllActiveOrgAlerts()).filter((a) => a.organizationId === currentOrg);

  const availableOrgs = masterMode
    ? CONTENT_ORGS.map((id) => ({ id, name: getSiteConfigForOrg(id).name }))
    : [{ id: currentOrg, name: getSiteConfigForOrg(currentOrg).name }];

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-4xl px-4 sm:px-6">
        <AdminSectionHeader
          badge="PARK ALERTS"
          currentOrg={currentOrg}
          currentPath="/admin/alerts"
          allowRolePreview={allowRolePreview}
          allowViewByUser={adminUser.isMaster}
        />

        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Rainout Alerts
          </h1>
          <p className="text-zinc-400">
            Post a manual rainout alert that overrides automatic Assignr detection.
            The modal displays on the public site until the alert expires or is cleared.
          </p>
        </div>

        <AdminAlertsManager
          activeAlerts={activeAlerts}
          availableOrgs={availableOrgs}
          defaultOrg={currentOrg}
        />
      </section>
    </main>
  );
}
