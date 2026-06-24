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
            All-Star Voting Management
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Use this seasonal workspace to move each All-Star age group from setup to coach voting, final roster decisions, payment tracking, and parent cap orders. Start with the active site and season, then publish only the cycles that are ready for coaches.
          </p>
          <div className="mt-4 grid gap-3 text-sm text-zinc-300 md:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Season flow</p>
              <p className="mt-1">Create cycle, load candidates, assign coaches, open voting, close results.</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">After voting</p>
              <p className="mt-1">Review standings, make roster overrides, then use Payments and Cap Orders for parent follow-through.</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Site context</p>
              <p className="mt-1">All edits apply to the selected organization. Switch sites before changing cycles or access.</p>
            </div>
          </div>
        </div>

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
