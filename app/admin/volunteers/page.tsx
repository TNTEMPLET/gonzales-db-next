import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminVolunteersManager from "@/components/admin/AdminVolunteersManager";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Volunteer Cards | ${site.name}`,
    description: "JDP background checks, Abuse Awareness certificates, roles, and readiness.",
  };
}

export default async function VolunteersPage({
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
    redirect(`/admin/login?next=/admin/volunteers?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  if (!canAccessAdminModule(role, "VOLUNTEERS")) {
    redirect("/admin?denied=volunteers");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="VOLUNTEER CARDS"
            currentOrg={currentOrg}
            currentPath={`/admin/volunteers?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Volunteer Cards</h1>
          <p className="max-w-3xl text-zinc-400">
            JDP background checks, Abuse Awareness certificates, roles, and readiness.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <AdminVolunteersManager targetOrg={currentOrg} focusUserId={userId || null} />
        </div>
      </section>
    </main>
  );
}
