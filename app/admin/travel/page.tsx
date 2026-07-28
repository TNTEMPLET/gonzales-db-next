import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveAllStarVaultAccessForAdmin } from "@/lib/allStar/auth";
import { hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarProgramNav from "@/components/admin/allStar/AllStarProgramNav";
import TravelDeskClient from "@/components/admin/travel/TravelDeskClient";
import {
  getSiteConfig,
  isAdminModuleEnabledForOrg,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Travel Desk | ${site.name}`,
    description: "All-Star regional travel parent intake and Sheet export.",
  };
}

export default async function AdminTravelPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org ?? undefined);
  if (!isAdminModuleEnabledForOrg(currentOrg, "ALL_STAR_VAULT")) {
    redirect(`/admin?org=${currentOrg}&denied=travel`);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) {
    redirect(`/admin/login?next=/admin/travel?org=${currentOrg}`);
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
    redirect("/admin?denied=travel");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="TRAVEL"
            currentOrg={currentOrg}
            currentPath="/admin/travel"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Travel Desk
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Collect parent travel roster fields via magic links, store answers in
            the DB, and export CSV matching the multi-league Google Sheet headers
            (First Name through Throws).
          </p>
        </div>

        <AllStarProgramNav stage="travel" org={currentOrg} />

        <TravelDeskClient organizationId={currentOrg} />
      </section>
    </main>
  );
}
