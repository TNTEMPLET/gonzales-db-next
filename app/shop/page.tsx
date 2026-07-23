import Link from "next/link";
import { redirect } from "next/navigation";

import ShopLoginGate from "@/components/merch/ShopLoginGate";
import ShopOrderForm from "@/components/merch/ShopOrderForm";
import {
  getMerchShopIntro,
  listMerchProductsForOrgAsync,
  orgHasMerchShop,
} from "@/lib/merch/catalog";
import { getShopAccess } from "@/lib/merch/shopAccess";
import {
  getSiteConfig,
  isContentOrgId,
  isMasterDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

/** Storefront H1 — league-facing labels (not shortName + "Merch"). */
function shopPageTitle(orgId: ContentOrgId): string {
  if (orgId === "ascension") return "Ascension Little League";
  if (orgId === "gonzales") return "Gonzales DYB";
  return getSiteConfig().name;
}

export function generateMetadata() {
  const site = getSiteConfig();
  const title = isContentOrgId(site.orgId) ? shopPageTitle(site.orgId) : site.name;
  return {
    title: `Shop | ${title}`,
    description: `Members-only merchandise for ${title}. Sign in required. Secure checkout with PayPal.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function ShopPage() {
  if (isMasterDeployment()) {
    redirect("/admin/shop");
  }

  const site = getSiteConfig();
  if (!isContentOrgId(site.orgId)) {
    redirect("/");
  }

  const pageTitle = shopPageTitle(site.orgId);
  const access = await getShopAccess();
  // Catalog exists for this org (even if every SKU is currently closed).
  const hasCatalog = orgHasMerchShop(site.orgId);

  // Never render product cards or PayPal NCP URLs until the visitor is signed in.
  if (!access.allowed) {
    return (
      <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
        <section className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8 sm:mb-10">
            <div className="inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
              SHOP
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
              {pageTitle}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
              Championship gear for registered players and families. Sign in to continue.
            </p>
          </div>
          <ShopLoginGate leagueName={pageTitle} />
        </section>
      </main>
    );
  }

  // Only products that are Open (and in window) — closed shirts leave the storefront.
  const products = await listMerchProductsForOrgAsync(site.orgId);

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8 sm:mb-10">
          <div className="inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
            SHOP
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
            {pageTitle}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
            {getMerchShopIntro(site.orgId)}
          </p>
          <p className="mt-2 text-xs text-amber-200/80">
            Members only — signed in as{" "}
            <span className="font-medium text-amber-100">
              {access.coach?.email ?? access.admin?.email ?? "league member"}
            </span>
            .
          </p>
        </div>

        {!hasCatalog ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-8 text-center">
            <h2 className="text-xl font-semibold text-zinc-100">Shop coming soon</h2>
            <p className="mt-2 text-sm text-zinc-400">
              We do not have active merchandise listings for this site yet.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              Back to home
            </Link>
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-8 text-center">
            <h2 className="text-xl font-semibold text-zinc-100">Orders closed</h2>
            <p className="mt-2 text-sm text-zinc-400">
              We are not taking merch orders right now. Check back later or contact your league
              board.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              Back to home
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-6 max-w-2xl text-sm text-zinc-400">
              Pick your shirt and sizes, then pay with PayPal on this page. No copy/paste and no
              retyping sizes — we keep your order details for the league automatically.
            </p>
            <ShopOrderForm
              products={products}
              org={site.orgId}
              defaultEmail={access.coach?.email ?? access.admin?.email ?? ""}
            />
            <p className="mt-8 text-center text-xs text-zinc-600">
              Questions about an order? Contact your league board. Fulfillment is tracked in the
              league admin order desk after PayPal payment clears.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
