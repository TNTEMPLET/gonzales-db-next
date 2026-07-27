import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminRoleAssignmentConsole from "@/components/admin/AdminRoleAssignmentConsole";
import {
  hasAdminRoleAtLeast,
  toAdminRole,
} from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { getSiteConfig, isMasterDeployment } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Role Assignment | ${site.name}`,
    description:
      "Master-only role assignment console. Grant the smallest possible admin privileges across organizations.",
  };
}

export default async function AdminRoleAssignmentPage() {
  if (!isMasterDeployment()) {
    redirect("/admin?denied=role-assignment");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=${encodeURIComponent("/admin/roles")}`);
  }

  if (!adminUser.isMaster) {
    redirect("/admin?denied=role-assignment-master");
  }

  // Compute effective role (should be MASTER_ADMIN on master)
  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    "gonzales", // any content org is fine for rank check
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);

  if (!hasAdminRoleAtLeast(role, "MASTER_ADMIN")) {
    redirect("/admin?denied=role-assignment");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ROLE ASSIGNMENT"
            currentPath="/admin/roles"
            orgSwitcherShowAllSites={false}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
            moduleHubHref="/admin"
            moduleHubLabel="Back to Control Center"
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Role Assignment
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Grant the <span className="text-zinc-200">smallest possible</span> admin privileges.
            Master Admins can promote, change per-org roles, and demote. Use ADMIN for normal league
            operators. Reserve BOARD_MEMBER and MASTER_ADMIN for true platform needs.
          </p>
          <p className="mt-2 max-w-3xl text-sm text-amber-300/90">
            Changes are audited. The protected master account can only be managed by itself.
          </p>
        </div>

        <AdminRoleAssignmentConsole
          currentAdminEmail={adminUser.email}
          isMasterAdmin={adminUser.isMaster || role === "MASTER_ADMIN"}
        />
      </section>
    </main>
  );
}
