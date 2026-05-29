import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  resolveAllStarVaultAccessForAdmin,
} from "@/lib/allStar/auth";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarRosterPayments from "@/components/admin/allStar/AllStarRosterPayments";
import AllStarCrossOrgPaymentSummary from "@/components/admin/allStar/AllStarCrossOrgPaymentSummary";
import AllStarPageConfigPanel from "@/components/admin/allStar/AllStarPageConfigPanel";
import { getSiteConfig, isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `All-Star Payments | ${site.name}`,
    description: "View and manage All-Star payment rosters.",
  };
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org ?? undefined);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) {
    redirect("/admin/login?next=/admin/payments");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  const { vaultView } = await resolveAllStarVaultAccessForAdmin({
    isMaster: adminUser.isMaster,
    email: adminUser.email,
    organizationId: currentOrg,
  });

  if (!vaultView && !adminUser.isMaster) {
    redirect("/admin?denied=payments");
  }

  const masterMode = isMasterDeployment();

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ALL-STAR PAYMENTS"
            currentOrg={currentOrg}
            currentPath="/admin/payments"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            All-Star Payment Rosters
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Payment records for each All-Star roster, organized by team. Mark players paid or unpaid as fees are collected.
          </p>
        </div>

        {masterMode ? (
          <AllStarCrossOrgPaymentSummary />
        ) : (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-950/80 overflow-hidden p-6">
            <AllStarRosterPayments org={currentOrg} />
          </div>
        )}

        {masterMode ? (
          <>
            <div className="mt-8 mb-2">
              <h2 className="text-xl font-semibold text-white">All-Stars Page Settings</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Configure the public-facing All-Stars page for each organization.
              </p>
            </div>
            <AllStarPageConfigPanel org="gonzales" orgLabel="Gonzales Diamond Baseball" />
            <AllStarPageConfigPanel org="ascension" orgLabel="Ascension Little League" />
          </>
        ) : (
          <AllStarPageConfigPanel org={currentOrg} />
        )}
      </section>
    </main>
  );
}
