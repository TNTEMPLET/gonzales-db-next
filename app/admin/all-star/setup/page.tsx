import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import AllStarBallotSetupWizard from "@/components/admin/AllStarBallotSetupWizard";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import {
  canManageAllStarVault,
  canViewAllStarVault,
} from "@/lib/allStar/auth";
import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { getSiteConfig, isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Ballot Setup | ${site.name}`,
    description: "Create a new All-Star ballot with guided setup questions.",
  };
}

export default async function AdminAllStarSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; cycleId?: string }>;
}) {
  const { org, cycleId } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) {
    redirect("/admin/login?next=/admin/all-star/setup");
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
  if (!canManageAllStarVaultUi) {
    redirect(`/admin/all-star?org=${currentOrg}`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-3xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ALL-STAR VAULT"
            currentOrg={currentOrg}
            currentPath="/admin/all-star/setup"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">Set Up a Ballot</h1>
          <p className="text-zinc-400 max-w-2xl">
            Answer a short series of questions to create and publish a new ballot. Existing ballots and submitted votes
            are not changed by this flow.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/admin/all-star?org=${currentOrg}`}
              className="inline-flex items-center rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Back to Snapshot Board
            </Link>
            <Link
              href={`/admin/all-star/cycle-management?org=${currentOrg}`}
              className="inline-flex items-center rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Open Cycle Management
            </Link>
          </div>
        </div>

        <AllStarBallotSetupWizard
          key={`${currentOrg}-${cycleId ?? "new"}`}
          initialOrg={currentOrg}
          isMasterMode={isMasterDeployment()}
          initialCycleId={cycleId ?? ""}
        />
      </section>
    </main>
  );
}
