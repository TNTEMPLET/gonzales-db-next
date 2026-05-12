import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminAssignrAssignmentsManager from "@/components/admin/AdminAssignrAssignmentsManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Assignr Assignments | ${site.name}`,
    description: "Manage umpire assignments in Assignr.",
  };
}

export default async function AdminAssignrAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const orgId = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) redirect("/admin/login?next=/admin/assignr/assignments");

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    orgId,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "ASSIGNR")) redirect("/admin?denied=assignr");

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <AdminSectionHeader
          badge="ASSIGNR"
          currentOrg={orgId}
          currentPath="/admin/assignr/assignments"
          allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
          allowViewByUser={adminUser.isMaster}
        />
        <h1 className="text-3xl font-bold mb-6">Assignment desk</h1>
        <AdminAssignrAssignmentsManager targetOrg={orgId} />
      </section>
    </main>
  );
}
