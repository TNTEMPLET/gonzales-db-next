import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, toAdminRole } from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminTeamsManager from "@/components/admin/AdminTeamsManager";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Teams Management | ${site.name}`,
    description: "Manage teams, rosters, and coach assignments by site.",
  };
}

export default async function AdminTeamsPage({
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
    redirect("/admin/login?next=/admin/teams");
  }

  const role = toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "TEAMS")) {
    redirect("/admin?denied=teams");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="TEAMS MODULE"
            currentOrg={currentOrg}
            currentPath="/admin/teams"
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Teams Management
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Import registered players, build team rosters, assign coaches, and manage
            team operations for the selected site and season.
          </p>
        </div>

        <AdminTeamsManager targetOrg={currentOrg} />
      </section>
    </main>
  );
}
