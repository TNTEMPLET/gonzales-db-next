import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminUsersManager from "@/components/admin/AdminUsersManager";
import DirectoryScopeToggle from "@/components/admin/people/DirectoryScopeToggle";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Directory | ${site.name}`,
    description: "Registered accounts, coach flags, admin access, duplicates, and bulk email.",
  };
}

export default async function UsersPage({
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
    redirect(`/admin/login?next=/admin/users?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  if (!canAccessAdminModule(role, "USERS")) {
    redirect("/admin?denied=users");
  }

  // Cross-org aggregate Directory view -- master-only, explicit ?org=all.
  const isMaster = adminUser.isMaster || role === "MASTER_ADMIN";
  const directoryScope: ContentOrgId | "all" = org === "all" && isMaster ? "all" : currentOrg;

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="DIRECTORY"
            currentOrg={directoryScope === "all" ? null : currentOrg}
            currentPath={`/admin/users?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Directory</h1>
          <p className="max-w-3xl text-zinc-400">
            Registered accounts, coach flags, admin access, duplicates, and bulk email.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6 space-y-6">
          {isMaster ? (
            <div className="flex justify-end">
              <DirectoryScopeToggle targetOrg={currentOrg} directoryScope={directoryScope} />
            </div>
          ) : null}
          <AdminUsersManager targetOrg={directoryScope} />
        </div>
      </section>
    </main>
  );
}
