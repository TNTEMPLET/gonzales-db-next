import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import OrdersHub, { type OrdersTab } from "@/components/admin/orders/OrdersHub";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Orders & Commerce | ${site.name}`,
    description: "Cap orders, championship shirt orders, merch shop catalog, and payment logs.",
  };
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; tab?: string }>;
}) {
  const { org, tab: tabParam } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/orders");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  const canPayments = canAccessAdminModule(role, "ALL_STAR_PAYMENTS");
  const canSponsors = canAccessAdminModule(role, "SPONSORS");
  const canReports = canAccessAdminModule(role, "REPORTS");

  if (!canPayments && !canSponsors && !canReports) {
    redirect("/admin?denied=orders");
  }

  const initialTab: OrdersTab = (tabParam as OrdersTab) || "caps";

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ORDERS & COMMERCE"
            currentOrg={currentOrg}
            currentPath={`/admin/orders?tab=${initialTab}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Orders & Commerce Desk
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Fulfill cap orders, manage championship shirt requests, review merch catalog PayPal links, track sponsors, and inspect payment transactions.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-zinc-400">
              Loading orders desk…
            </div>
          }
        >
          <OrdersHub
            targetOrg={currentOrg}
            initialTab={initialTab}
            isMaster={adminUser.isMaster || role === "MASTER_ADMIN"}
          />
        </Suspense>
      </section>
    </main>
  );
}
