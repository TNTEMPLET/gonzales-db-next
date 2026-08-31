import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import ParentShirtOrdersPanel from "@/components/admin/shirtOrders/ParentShirtOrdersPanel";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Championship Shirts | ${site.name}`,
    description: "Manage All-Star championship shirt orders, sizes, and team lists.",
  };
}

export default async function ShirtOrdersPage({
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
    redirect(`/admin/login?next=/admin/shirt-orders?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  // No dedicated AdminModule for this tab -- same "ordersVisible" gate
  // sidebarNav.ts uses to decide whether to show this leaf at all.
  const ordersVisible = canAccessAdminModule(role, "SPONSORS") || canAccessAdminModule(role, "REPORTS");
  if (!ordersVisible) {
    redirect("/admin?denied=shirt-orders");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="CHAMPIONSHIP SHIRTS"
            currentOrg={currentOrg}
            currentPath={`/admin/shirt-orders?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Championship Shirts</h1>
          <p className="max-w-3xl text-zinc-400">
            Manage All-Star championship shirt orders, sizes, and team lists.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <ParentShirtOrdersPanel />
        </div>
      </section>
    </main>
  );
}
