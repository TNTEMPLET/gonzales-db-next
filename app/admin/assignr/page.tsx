import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminAssignrHub from "@/components/admin/AdminAssignrHub";
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
    title: `Assignr | ${site.name}`,
    description: "Manage Assignr games, assignments, officials, and pay workflows.",
  };
}

export default async function AdminAssignrPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const orgId = resolveAdminTargetOrg(org);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/assignr");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    orgId,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "ASSIGNR")) {
    redirect("/admin?denied=assignr");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ASSIGNR"
            currentOrg={orgId}
            currentPath="/admin/assignr"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">Assignr</h1>
          <p className="text-zinc-400 max-w-2xl">
            Use this when a schedule, official, assignment, or statement needs
            attention in Assignr. Pick the job below and confirm the selected
            site before making changes, because these tools connect to Assignr.
          </p>
        </div>
        <AdminAssignrHub targetOrg={orgId} />
      </section>
    </main>
  );
}
