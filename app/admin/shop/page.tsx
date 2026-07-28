import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarProgramNav from "@/components/admin/allStar/AllStarProgramNav";
import { ShopAdminProductTable } from "@/components/merch/ShopCatalog";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { listMerchProductsForOrgAsync } from "@/lib/merch/catalog";
import {
  getSiteConfig,
  isContentOrgId,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

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
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  if (!adminUser.isMaster && !hasAdminRoleAtLeast(role, "BOARD_MEMBER")) {
    redirect("/admin?denied=shop");
  }

  const catalogOrg: ContentOrgId | null = isContentOrgId(currentOrg) ? currentOrg : null;
  const products = catalogOrg
    ? await listMerchProductsForOrgAsync(catalogOrg, { includeClosed: true })
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

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <Link
            href={`/admin/shop/test-order${orgQuery}`}
            className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-sm text-zinc-200 hover:border-amber-600/50"
          >
            <p className="font-semibold text-amber-100">Test order / drafts</p>
            <p className="mt-1 text-xs text-amber-100/70">Save draft → PayPal → match</p>
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
          <p className="font-medium">Catalog SKUs (database) + open/closed status</p>
          <p className="mt-1 text-sky-100/80">
            Product names, PayPal NCP links, and prices live in the{" "}
            <code className="rounded bg-sky-950/50 px-1.5 py-0.5 text-xs">MerchProduct</code> table
            (seeded from code on first load). Use the{" "}
            <span className="font-medium text-emerald-200">Open</span> /{" "}
            <span className="font-medium text-zinc-200">Closed</span> toggle to stop taking orders
            without a deploy. After payments sync, correct shirt sizes on{" "}
            <Link href={`/admin/shirt-orders${orgQuery}`} className="text-sky-200 underline">
              Shirt orders
            </Link>
            .
          </p>
        </div>

        {!catalogOrg ? (
          <p className="text-sm text-zinc-500">
            Select Gonzales, Ascension, or Fall Ball with the org switcher to view that site&apos;s
            catalog.
          </p>
        ) : (
          <ShopAdminProductTable products={products} orgQuery={orgQuery} org={catalogOrg} />
        )}
      </section>
    </main>
  );
}
