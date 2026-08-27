import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import OnlineDraftDesk from "@/components/admin/draft/OnlineDraftDesk";
import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Online Draft | ${site.name}`,
    description: "Live draft room, coach protections, and roster builder.",
  };
}

export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; season?: string }>;
}) {
  const { org, season } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const seasonYear = season ? parseInt(season, 10) : 2026;
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=/admin/draft?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  const canTeams = canAccessAdminModule(role, "TEAMS");
  if (!canTeams) {
    redirect("/admin?denied=draft");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="ONLINE DRAFT"
            currentOrg={currentOrg}
            currentPath={`/admin/draft?org=${currentOrg}`}
          />
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <OnlineDraftDesk targetOrg={currentOrg} seasonYear={seasonYear} />
        </div>
      </section>
    </main>
  );
}
