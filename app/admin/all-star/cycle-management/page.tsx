import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

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
    title: `Cycle Management | ${site.name}`,
    description: "Create and edit All-Star ballot cycles.",
  };
}

export default async function AdminAllStarCycleManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; cycleId?: string; openModules?: string; tab?: string }>;
}) {
  const { org, cycleId, openModules, tab } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) {
    redirect("/admin/login?next=/admin/all-star/cycle-management");
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
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ALL-STAR VAULT"
            currentOrg={currentOrg}
            currentPath="/admin/all-star/cycle-management"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            All-Star Cycle Management
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Create and edit ballot cycles, then manage status windows, roster imports, invites, and exports.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/admin/all-star?org=${currentOrg}`}
              className="inline-flex items-center rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Back to Snapshot Board
            </Link>
            {canManageAllStarVaultUi ? (
              <Link
                href={`/admin/all-star/setup?org=${currentOrg}`}
                className="inline-flex items-center rounded-lg border border-emerald-700 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-950/40"
              >
                Set up a new ballot
              </Link>
            ) : null}
          </div>
        </div>

        <AllStarVaultManager
          key={`${currentOrg}-${cycleId ?? "new"}`}
          initialOrg={currentOrg}
          isMasterMode={isMasterDeployment()}
          initialSelectedCycleId={cycleId ?? ""}
          initialOpenEditModules={openModules === "1"}
          initialWorkspaceTab={tab}
          showSnapshotBoardOnInitialFullAccess={false}
          canManageAllStarVault={canManageAllStarVaultUi}
          canViewAllStarVault={vaultView}
          isLimitedVaultAccess={isLimitedVaultAccess}
        />
      </section>
    </main>
  );
}
