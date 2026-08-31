import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminCoachingInterestManager from "@/components/admin/AdminCoachingInterestManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { isCoachingInterestEnabled } from "@/lib/org/capabilities";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Coaching Interest | ${site.name}`,
    description: "Fall Ball coach leads, follow-up status, and export for registration planning.",
  };
}

export default async function CoachingInterestPage({
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
    redirect(`/admin/login?next=/admin/coaching-interest?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  const canCoachingInterest =
    canAccessAdminModule(role, "TEAMS") && isCoachingInterestEnabled(currentOrg);
  if (!canCoachingInterest) {
    redirect("/admin?denied=coaching-interest");
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="COACHING INTEREST"
            currentOrg={currentOrg}
            currentPath={`/admin/coaching-interest?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Coaching Interest</h1>
          <p className="max-w-3xl text-zinc-400">
            Fall Ball coach leads, follow-up status, and export for registration planning.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <AdminCoachingInterestManager targetOrg={currentOrg} />
        </div>
      </section>
    </main>
  );
}
