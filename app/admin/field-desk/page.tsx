import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import FieldDesk from "@/components/admin/FieldDesk";
import ParkWorkFilter from "@/components/admin/ParkWorkFilter";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { loadFieldDeskGames } from "@/lib/admin/fieldDesk";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getOrgDisplayName, getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Field desk | ${site.name}`,
    description: "Check scoreboard controllers in and out, and copy game details onto printed umpire cards.",
  };
}

export default async function FieldDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; park?: string }>;
}) {
  const { org, park } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=/admin/field-desk?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
  if (!effectiveRole || !hasAdminRoleAtLeast(role, "PARK_DIRECTOR")) {
    redirect("/admin?denied=field-desk");
  }

  const { games, parks } = await loadFieldDeskGames(currentOrg);
  const requestedPark = park?.trim() || "";
  const selectedPark = parks.includes(requestedPark) ? requestedPark : null;
  const visibleGames = selectedPark ? games.filter((game) => game.parkName === selectedPark) : games;

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="FIELD DESK"
            currentOrg={currentOrg}
            currentPath={`/admin/field-desk?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Field desk</h1>
          <p className="max-w-3xl text-zinc-400">
            This week’s posted games. Check scoreboard controllers out and back in, read the crew their fields, and copy the list onto the printed umpire cards.
          </p>
        </div>
        <ParkWorkFilter org={currentOrg} parks={parks} selected={selectedPark} />
        <FieldDesk
          org={currentOrg}
          orgLabel={getOrgDisplayName(currentOrg)}
          games={visibleGames}
          parkName={selectedPark}
        />
      </section>
    </main>
  );
}
