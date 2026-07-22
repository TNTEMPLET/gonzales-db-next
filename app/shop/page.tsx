import Link from "next/link";
import { redirect } from "next/navigation";

import ShopCatalog from "@/components/merch/ShopCatalog";
import {
  getMerchShopIntro,
  listMerchProductsForOrg,
  orgHasMerchShop,
} from "@/lib/merch/catalog";
import {
  getSiteConfig,
  isContentOrgId,
  isMasterDeployment,
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Shop | ${site.name}`,
    description: `Official merchandise for ${site.name}. Secure checkout with PayPal.`,
  };
}

export default function ShopPage() {
  if (isMasterDeployment()) {
    redirect("/admin/shop");
  }

  const site = getSiteConfig();
  if (!isContentOrgId(site.orgId)) {
    redirect("/");
  }

  const products = listMerchProductsForOrg(site.orgId);
  const hasShop = orgHasMerchShop(site.orgId);

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8 sm:mb-10">
          <div className="inline-block rounded-full bg-brand-purple px-4 py-2 text-[11px] tracking-[2px] sm:px-6 sm:text-xs sm:tracking-[3px]">
            SHOP
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-5xl">
            {site.shortName} Merch
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400 sm:text-base">
            {getMerchShopIntro(site.orgId)}
          </p>
        </div>

        {!hasShop ? (
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
        ) : (
          <>
            <ShopCatalog products={products} />
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
