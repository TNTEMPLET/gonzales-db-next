import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveAllStarVaultAccessForAdmin } from "@/lib/allStar/auth";
import { hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarProgramNav from "@/components/admin/allStar/AllStarProgramNav";
import AllStarVaultManager from "@/components/admin/AllStarVaultManager";
import {
  getSiteConfig,
  isAdminModuleEnabledForOrg,
  isMasterDeployment,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

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
  if (!isAdminModuleEnabledForOrg(currentOrg, "ALL_STAR_VAULT")) {
    redirect("/admin?org=fallball&denied=all-star");
  }

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
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  const { vaultView, canManageAllStarVaultUi, isLimitedVaultAccess } =
    await resolveAllStarVaultAccessForAdmin({
      isMaster: adminUser.isMaster,
      email: adminUser.email,
      organizationId: currentOrg,
    });

  if (!vaultView) {
    redirect("/admin?denied=all-star");
  }

  const masterMode = isMasterDeployment();

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ALL-STAR VAULT"
            currentOrg={currentOrg}
            currentPath="/admin/all-star"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            All-Star Program
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Seasonal workspace: set up cycles and ballots in the Vault, then track fees, parent
            cap orders, and championship shirt orders. All edits apply to the selected organization.
          </p>
        </div>

        <AllStarProgramNav stage="vault" org={currentOrg} />

        <AllStarVaultManager
          key={currentOrg}
          initialOrg={currentOrg}
          isMasterMode={masterMode}
          isMasterAuditAdmin={adminUser.isMaster}
          canManageAllStarVault={canManageAllStarVaultUi}
          canViewAllStarVault={vaultView}
          isLimitedVaultAccess={isLimitedVaultAccess}
        />
      </section>
    </main>
  );
}
