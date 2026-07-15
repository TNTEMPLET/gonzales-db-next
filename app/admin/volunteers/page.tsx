import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminVolunteersManager from "@/components/admin/AdminVolunteersManager";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Volunteers | ${site.name}`,
    description: "Volunteer cards for JDP background checks and Abuse Awareness compliance.",
  };
}

export default async function AdminVolunteersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; userId?: string }>;
}) {
  const { org, userId } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/volunteers");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "VOLUNTEERS")) {
    redirect("/admin?denied=volunteers");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="VOLUNTEERS"
            currentOrg={currentOrg}
            currentPath="/admin/volunteers"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Volunteer Cards
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Track JDP background checks and Abuse Awareness certificates for coaches and
            volunteers. Export CSV reports and keep compliance visible at a glance.
          </p>
        </div>

        <AdminVolunteersManager
          targetOrg={currentOrg}
          focusUserId={userId || null}
          isMaster={adminUser.isMaster || role === "MASTER_ADMIN"}
        />
      </section>
    </main>
  );
}
