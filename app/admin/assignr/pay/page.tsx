import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminAssignrPayManager from "@/components/admin/AdminAssignrPayManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { assignrHubHref } from "@/lib/admin/assignrOrgScope";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Assignr Pay | ${site.name}`,
    description: "Reconcile Assignr statements.",
  };
}

export default async function AdminAssignrPayPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const orgId = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) redirect("/admin/login?next=/admin/assignr/pay");

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    orgId,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  if (!canAccessAdminModule(role, "ASSIGNR")) redirect("/admin?denied=assignr");

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <AdminSectionHeader
          badge="ASSIGNR"
          currentOrg={orgId}
          currentPath="/admin/assignr/pay"
          allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
          allowViewByUser={adminUser.isMaster}
          moduleHubHref={assignrHubHref(orgId)}
          moduleHubLabel="Assignr Hub"
        />
        <h1 className="text-3xl font-bold mb-6">Pay & statements</h1>
        <AdminAssignrPayManager targetOrg={orgId} />
      </section>
    </main>
  );
}
