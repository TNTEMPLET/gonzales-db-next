import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarProgramNav from "@/components/admin/allStar/AllStarProgramNav";
import MerchDraftsList from "@/components/merch/MerchDraftsList";
import MerchTestOrderForm from "@/components/merch/MerchTestOrderForm";
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
    title: `Merch test order | ${site.name}`,
    description: "Prototype structured shirt order form based on PayPal NCP fields.",
  };
}

function orgDisplayName(org: ContentOrgId): string {
  if (org === "ascension") return "Ascension Little League";
  if (org === "gonzales") return "Gonzales DYB";
  if (org === "fallball") return "AP Fall Ball";
  return org;
}

export default async function AdminMerchTestOrderPage({
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
    redirect("/admin/login?next=/admin/shop/test-order");
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
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="TEST ORDER"
            currentOrg={currentOrg}
            currentPath="/admin/shop/test-order"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Merch test order form
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Next-campaign checkout for{" "}
            {catalogOrg ? orgDisplayName(catalogOrg) : "this org"}: save a draft (player + sizes),
            then pay with <span className="text-zinc-200">embedded PayPal</span> (one AP Baseball
            business account). Already-distributed NCP links are not changed.
          </p>
          <p className="mt-3 text-sm">
            <Link href={`/admin/shop${orgQuery}`} className="text-sky-300 hover:underline">
              ← Back to merch catalog
            </Link>
            {" · "}
            <Link href={`/admin/shirt-orders${orgQuery}`} className="text-sky-300 hover:underline">
              Shirt orders desk
            </Link>
          </p>
        </div>

        <AllStarProgramNav stage="shop" org={catalogOrg} />

        {!catalogOrg ? (
          <p className="text-sm text-zinc-500">
            Select Gonzales or Ascension with the org switcher to load that catalog into the test
            form.
          </p>
        ) : (
          <>
            <MerchTestOrderForm
              products={products}
              orgLabel={orgDisplayName(catalogOrg)}
              org={catalogOrg}
            />
            <MerchDraftsList org={catalogOrg} />
          </>
        )}
      </section>
    </main>
  );
}
