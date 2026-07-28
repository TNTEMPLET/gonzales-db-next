import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveAllStarVaultAccessForAdmin } from "@/lib/allStar/auth";
import { hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarProgramNav from "@/components/admin/allStar/AllStarProgramNav";
import ParentShirtOrdersPanel from "@/components/admin/shirtOrders/ParentShirtOrdersPanel";
import {
  getSiteConfig,
  isAdminModuleEnabledForOrg,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Championship Shirt Orders | ${site.name}`,
    description: "View and export championship shirt orders by organization.",
  };
}

export default async function AdminShirtOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org ?? undefined);
  if (!isAdminModuleEnabledForOrg(currentOrg, "ALL_STAR_PAYMENTS")) {
    redirect(`/admin?org=${currentOrg}&denied=shirt-orders`);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) {
    redirect("/admin/login?next=/admin/shirt-orders");
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
    redirect("/admin?denied=shirt-orders");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SHIRT ORDERS"
            currentOrg={currentOrg}
            currentPath="/admin/shirt-orders"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Championship Shirt Orders
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Track championship shirt orders from PayPal checkout (e.g. Gonzales 11U DYB State Champs
            at $15). Sync orders, review player name + size notes, mark each shirt fulfilled, export
            CSV, or email the vendor report from this page using league Communications email — no
            need to open the Communications module.
          </p>
          <div className="mt-4 rounded-xl border border-sky-800/50 bg-sky-950/20 p-3 text-sm text-sky-100">
            Shop drafts save structured sizes first, then parents pay on PayPal with a note like{" "}
            <span className="font-mono text-sky-50">MO-XXXX | name | sizes</span>. Sync/webhook
            matches the <span className="font-mono">MO-</span> code so the desk uses the saved sizes
            instead of free-typed PayPal text. Legacy notes without a code still parse as{" "}
            <span className="font-mono text-sky-50">name | sizes</span>.
          </div>
        </div>

        <AllStarProgramNav stage="shirt-orders" org={currentOrg} />

        <ParentShirtOrdersPanel />
      </section>
    </main>
  );
}
