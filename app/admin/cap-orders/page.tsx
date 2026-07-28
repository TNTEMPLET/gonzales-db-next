import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveAllStarVaultAccessForAdmin } from "@/lib/allStar/auth";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarProgramNav from "@/components/admin/allStar/AllStarProgramNav";
import ParentCapOrdersPanel from "@/components/admin/capOrders/ParentCapOrdersPanel";
import {
  getSiteConfig,
  isAdminModuleEnabledForOrg,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Parent Cap Orders | ${site.name}`,
    description: "View and export All-Star parent cap orders by organization.",
  };
}

export default async function AdminCapOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org ?? undefined);
  if (!isAdminModuleEnabledForOrg(currentOrg, "ALL_STAR_PAYMENTS")) {
    redirect(`/admin?org=${currentOrg}&denied=cap-orders`);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) {
    redirect("/admin/login?next=/admin/cap-orders");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  const { vaultView } = await resolveAllStarVaultAccessForAdmin({
    isMaster: adminUser.isMaster,
    email: adminUser.email,
    organizationId: currentOrg,
  });

  if (!vaultView && !adminUser.isMaster && !hasAdminRoleAtLeast(role, "BOARD_MEMBER")) {
    redirect("/admin?denied=cap-orders");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="CAP ORDERS"
            currentOrg={currentOrg}
            currentPath="/admin/cap-orders"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Parent Cap Orders
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Track parent cap orders that arrive through All-Star PayPal checkout. Sync orders, review payer notes for hat sizes, mark each cap fulfilled, and export the open list for pickup or vendor coordination.
          </p>
          <div className="mt-4 rounded-xl border border-sky-800/50 bg-sky-950/20 p-3 text-sm text-sky-100">
            Cap orders are the last step after roster and payment setup. Recheck payer notes before fulfillment because size details come from parent-entered checkout text.
          </div>
        </div>

        <AllStarProgramNav stage="cap-orders" org={currentOrg} />

        <ParentCapOrdersPanel />
      </section>
    </main>
  );
}
