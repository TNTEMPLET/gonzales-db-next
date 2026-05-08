import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  canViewAllStarVault,
  canManageAllStarVault,
} from "@/lib/allStar/auth";
import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarVaultManager from "@/components/admin/AllStarVaultManager";
import prisma from "@/lib/prisma";
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
  const moduleAllStar = canAccessAdminModule(role, "ALL_STAR_VAULT");

  const vaultLinkedUsers = await prisma.registeredUser.findMany({
    where: {
      email: { equals: adminUser.email, mode: "insensitive" },
      organizationId: currentOrg,
    },
    select: { id: true },
  });
  let vaultView = false;
  let vaultManage = false;
  for (const row of vaultLinkedUsers) {
    if (await canViewAllStarVault(row.id, currentOrg)) vaultView = true;
    if (await canManageAllStarVault(row.id, currentOrg)) vaultManage = true;
  }

  if (!moduleAllStar && !vaultView) {
    redirect("/admin?denied=all-star");
  }

  const canManageAllStarVaultUi = moduleAllStar || vaultManage;
  const isLimitedVaultAccess = vaultView && !canManageAllStarVaultUi;

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ALL-STAR VAULT"
            currentOrg={currentOrg}
            currentPath="/admin/all-star"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
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
          isLimitedVaultAccess={isLimitedVaultAccess}
        />
      </section>
    </main>
  );
}
