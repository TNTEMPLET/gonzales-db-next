import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarProgramNav from "@/components/admin/allStar/AllStarProgramNav";
import { ShopAdminProductTable } from "@/components/merch/ShopCatalog";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { listMerchProductsForOrg } from "@/lib/merch/catalog";
import {
  getSiteConfig,
  isContentOrgId,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Merch Shop | ${site.name}`,
    description: "Catalog of league merchandise PayPal checkout links.",
  };
}

export default async function AdminShopPage({
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
    redirect("/admin/login?next=/admin/shop");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);

  if (!adminUser.isMaster && !hasAdminRoleAtLeast(role, "BOARD_MEMBER")) {
    redirect("/admin?denied=shop");
  }

  const catalogOrg: ContentOrgId | null = isContentOrgId(currentOrg) ? currentOrg : null;
  const products = catalogOrg
    ? listMerchProductsForOrg(catalogOrg, { includeInactive: true })
    : [];
  const orgQuery = catalogOrg ? `?org=${catalogOrg}` : "";

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="MERCH SHOP"
            currentOrg={currentOrg}
            currentPath="/admin/shop"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Merch catalog</h1>
          <p className="max-w-3xl text-zinc-400">
            Public storefront at{" "}
            <Link href="/shop" className="text-sky-300 hover:underline">
              /shop
            </Link>
            . Families buy through PayPal NCP links; orders show up in Shirt Orders or Cap Orders
            after sync/webhook.
          </p>
        </div>

        <AllStarProgramNav stage="shop" org={isContentOrgId(currentOrg) ? currentOrg : null} />

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Link
            href={`/admin/shirt-orders${orgQuery}`}
            className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-200 hover:border-zinc-600"
          >
            <p className="font-semibold text-white">Shirt orders</p>
            <p className="mt-1 text-xs text-zinc-500">Sync, fulfill, vendor CSV</p>
          </Link>
          <Link
            href={`/admin/cap-orders${orgQuery}`}
            className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-200 hover:border-zinc-600"
          >
            <p className="font-semibold text-white">Cap orders</p>
            <p className="mt-1 text-xs text-zinc-500">All-Star parent caps</p>
          </Link>
          <a
            href="https://www.paypal.com/buttons/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-200 hover:border-zinc-600"
          >
            <p className="font-semibold text-white">PayPal buttons</p>
            <p className="mt-1 text-xs text-zinc-500">Create / edit NCP links</p>
          </a>
        </div>

        <div className="mb-4 rounded-xl border border-sky-800/40 bg-sky-950/20 p-4 text-sm text-sky-100">
          <p className="font-medium">v1 catalog is code-configured</p>
          <p className="mt-1 text-sky-100/80">
            Add or edit products in{" "}
            <code className="rounded bg-sky-950/50 px-1.5 py-0.5 text-xs">lib/merch/catalog.ts</code>
            . Match <code className="text-xs">priceCents</code> and item title keywords to the PayPal
            button so shirt/cap order desks pick up payments correctly.
          </p>
        </div>

        {!catalogOrg ? (
          <p className="text-sm text-zinc-500">
            Select Gonzales, Ascension, or Fall Ball with the org switcher to view that site&apos;s
            catalog.
          </p>
        ) : (
          <ShopAdminProductTable products={products} orgQuery={orgQuery} />
        )}
      </section>
    </main>
  );
}
