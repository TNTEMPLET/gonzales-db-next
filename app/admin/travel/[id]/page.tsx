import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveAllStarVaultAccessForAdmin } from "@/lib/allStar/auth";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AllStarProgramNav from "@/components/admin/allStar/AllStarProgramNav";
import TravelEventDetailClient from "@/components/admin/travel/TravelEventDetailClient";
import {
  getSiteConfig,
  isAdminModuleEnabledForOrg,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Travel Event | ${site.name}`,
    description: "Manage trip participants and export Sheet CSV.",
  };
}

export default async function AdminTravelEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { id } = await params;
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org ?? undefined);
  if (!isAdminModuleEnabledForOrg(currentOrg, "ALL_STAR_VAULT")) {
    redirect(`/admin?org=${currentOrg}&denied=travel`);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  if (!adminUser) {
    redirect(
      `/admin/login?next=${encodeURIComponent(`/admin/travel/${id}?org=${currentOrg}`)}`,
    );
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
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
        </div>

        <AllStarProgramNav stage="travel" org={currentOrg} />

        <TravelEventDetailClient eventId={id} organizationId={currentOrg} />
      </section>
    </main>
  );
}
