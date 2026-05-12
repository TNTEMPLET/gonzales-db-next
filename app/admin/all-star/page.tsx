import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveAllStarVaultAccessForAdmin } from "@/lib/allStar/auth";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarVaultManager from "@/components/admin/AllStarVaultManager";
import { getSiteConfig, isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `All-Star Vault | ${site.name}`,
    description: "Manage AP Baseball All-Star voting cycles and ballots.",
  };
}

export default async function AdminAllStarPage({
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
    redirect("/admin/login?next=/admin/all-star");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  const { vaultView, canManageAllStarVaultUi, isLimitedVaultAccess } =
    await resolveAllStarVaultAccessForAdmin({
      isMaster: adminUser.isMaster,
      email: adminUser.email,
      organizationId: currentOrg,
    });

  if (!vaultView) {
    redirect("/admin?denied=all-star");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ALL-STAR VAULT"
            currentOrg={currentOrg}
            currentPath="/admin/all-star"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            All-Star Voting Management
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Manage ballot cycles, import players, assign head coaches, control vault access, publish invite links, and export voting results.
          </p>
        </div>

        <AllStarVaultManager
          key={currentOrg}
          initialOrg={currentOrg}
          isMasterMode={isMasterDeployment()}
          canManageAllStarVault={canManageAllStarVaultUi}
          canViewAllStarVault={vaultView}
          isLimitedVaultAccess={isLimitedVaultAccess}
        />
      </section>
    </main>
  );
}
