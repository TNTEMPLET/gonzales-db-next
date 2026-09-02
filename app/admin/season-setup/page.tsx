import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSeasonSetupChecklist from "@/components/admin/AdminSeasonSetupChecklist";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";
import { getSeasonConfigForOrg, isSeasonLiveForOrg } from "@/lib/seasonConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Season Setup | ${site.name}`,
    description: "Track season-setup progress: registration, coaches, drafts, jerseys, and schedule.",
  };
}

export default async function SeasonSetupPage({
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
    redirect(`/admin/login?next=/admin/season-setup?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  if (!canAccessAdminModule(role, "SEASON_SETUP")) {
    redirect("/admin?denied=season-setup");
  }

  const season = getSeasonConfigForOrg(currentOrg);
  const seasonIsLive = isSeasonLiveForOrg(currentOrg);

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SEASON SETUP"
            currentOrg={currentOrg}
            currentPath={`/admin/season-setup?org=${currentOrg}`}
            orgSwitcherShowAllSites={false}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Season Setup</h1>
          <p className="max-w-3xl text-zinc-400">
            Track season-setup progress: registration, coaches, drafts, jerseys, and schedule.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-300">
            <span>
              {season.label}
            </span>
            {seasonIsLive ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Live season
              </span>
            ) : (
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Not live
              </span>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <AdminSeasonSetupChecklist targetOrg={currentOrg} />
        </div>
      </section>
    </main>
  );
}
