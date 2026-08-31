import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import CompetitionImportTab from "@/components/admin/competition/CompetitionImportTab";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Import Registration Data | ${site.name}`,
    description: "Upload SportsConnect exports, review data quality, and audit past imports.",
  };
}

export default async function SportsConnectPage({
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
    redirect(`/admin/login?next=/admin/sports-connect?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  // No dedicated AdminModule for this tab -- gates the same as the sidebar's
  // "competitionVisible" check (lib/admin/sidebarNav.ts).
  const competitionVisible =
    canAccessAdminModule(role, "TEAMS") ||
    canAccessAdminModule(role, "DRAFT") ||
    canAccessAdminModule(role, "SCORES") ||
    canAccessAdminModule(role, "ASSIGNR") ||
    canAccessAdminModule(role, "REGISTRATION_WINDOWS");
  if (!competitionVisible) {
    redirect("/admin?denied=sports-connect");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="IMPORT REGISTRATION DATA"
            currentOrg={currentOrg}
            currentPath={`/admin/sports-connect?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Import Registration Data
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Upload SportsConnect exports, review data quality, and audit past imports.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <CompetitionImportTab targetOrg={currentOrg} />
        </div>
      </section>
    </main>
  );
}
