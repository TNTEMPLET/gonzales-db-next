import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminRoleAssignmentConsole from "@/components/admin/AdminRoleAssignmentConsole";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Role Assignment | ${site.name}`,
    description: "Master Admin console: grant, change, and revoke organization admin roles with least-privilege guidance.",
  };
}

export default async function RolesPage({
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
    redirect(`/admin/login?next=/admin/roles?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const isMaster = adminUser.isMaster || effectiveRole === "MASTER_ADMIN";

  if (!isMaster) {
    redirect("/admin?denied=roles");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ROLE ASSIGNMENT"
            currentOrg={currentOrg}
            currentPath={`/admin/roles?org=${currentOrg}`}
            allowRolePreview
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Role Assignment</h1>
          <p className="max-w-3xl text-zinc-400">
            Master Admin console: grant, change, and revoke organization admin roles with
            least-privilege guidance.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <AdminRoleAssignmentConsole currentAdminEmail={adminUser.email} isMasterAdmin={isMaster} />
        </div>
      </section>
    </main>
  );
}
