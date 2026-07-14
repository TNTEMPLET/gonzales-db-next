import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminCoachingInterestManager from "@/components/admin/AdminCoachingInterestManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { isCoachingInterestEnabled } from "@/lib/org/capabilities";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Coaching Interest | ${site.name}`,
    description: "Review and export Fall Ball coaching interest submissions.",
  };
}

export default async function AdminCoachingInterestPage({
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
    redirect("/admin/login?next=/admin/coaching-interest");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "TEAMS")) {
    redirect("/admin?denied=coaching-interest");
  }
  if (!isCoachingInterestEnabled(currentOrg)) {
    redirect("/admin?denied=coaching-interest");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="COACHING INTEREST"
            currentOrg={currentOrg}
            currentPath="/admin/coaching-interest"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Coaching Interest
          </h1>
          <p className="max-w-3xl text-zinc-400">
            Review Fall Ball coach leads, track follow-up status, and export a spreadsheet
            for registration planning.
          </p>
        </div>

        <AdminCoachingInterestManager targetOrg={currentOrg} />
      </section>
    </main>
  );
}
