import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import AdminSeasonSetupChecklist from "@/components/admin/AdminSeasonSetupChecklist";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import FallBallUmpirePayScheduleEditor from "@/components/admin/FallBallUmpirePayScheduleEditor";
import SeasonModeOverrideControl from "@/components/admin/SeasonModeOverrideControl";
import SpringRegistrationSummary from "@/components/admin/SpringRegistrationSummary";
import { loadSpringRegistrationSummary } from "@/lib/admin/springCombined/loadRegistration";
import {
  canOfferSpringCombined,
  isSpringCombinedParam,
  resolveSeasonSetupView,
  springLeaguesAreLive,
  SPRING_LEAGUE_ORGS,
} from "@/lib/admin/springCombined/view";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { loadSeasonMode } from "@/lib/season/loadMode";
import { getLiveContentOrgs, getSeasonConfigForOrg, isSeasonLiveForOrg } from "@/lib/seasonConfig";
import { getOrgDisplayName, getSiteConfig, isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

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
  const liveOrgs = getLiveContentOrgs();
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);
  const masterDeployment = isMasterDeployment();

  if (!adminUser) {
    if (isSpringCombinedParam(org)) {
      redirect("/admin/login?next=/admin/season-setup?org=spring");
    }
    const loginOrg = resolveAdminTargetOrg(org);
    redirect(`/admin/login?next=/admin/season-setup?org=${loginOrg}`);
  }

  const view = resolveSeasonSetupView({
    isMaster: adminUser.isMaster,
    masterDeployment,
    requestedOrg: org,
    liveOrgs,
  });
  if (view.mode === "denied") {
    redirect("/admin?denied=season-setup");
  }

  const offerSpring = canOfferSpringCombined({ isMaster: adminUser.isMaster, masterDeployment });
  const springCombined = offerSpring
    ? { selected: view.mode === "combined", suggested: !springLeaguesAreLive(liveOrgs) }
    : null;

  if (view.mode === "combined") {
    const effectiveRole = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, "gonzales");
    const role: AdminRole = effectiveRole ?? "MASTER_ADMIN";
    if (!canAccessAdminModule(role, "SEASON_SETUP")) {
      redirect("/admin?denied=season-setup");
    }
    const seasonYear = getSeasonConfigForOrg("gonzales").year;
    const summary = await loadSpringRegistrationSummary(seasonYear);
    return (
      <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
        <section className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8">
            <AdminSectionHeader
              badge="SEASON SETUP"
              currentOrg={null}
              currentPath="/admin/season-setup?org=spring"
              orgSwitcherShowAllSites={false}
              springCombined={springCombined}
              allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
              allowViewByUser={adminUser.isMaster}
            />
            <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Season Setup</h1>
            <p className="max-w-3xl text-zinc-400">
              Gonzales DYB and Ascension Little League side by side. This view is read-only. Coaches, volunteers,
              and All-Stars stay on each league&apos;s own screen.
            </p>
            <p className="mt-3 text-sm text-zinc-300">Spring {seasonYear}</p>
          </div>

          {canAccessAdminModule(role, "DIVISION_AGES") ? (
            <Link
              href="/admin/season-setup/division-ages?org=spring"
              className="mb-6 block rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-600 sm:p-6"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Forecast</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Division Ages</h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                Both leagues&apos; saved divisions in one table, with a combined player pool. Saving stays on the
                Gonzales or Ascension screen.
              </p>
            </Link>
          ) : null}

          <div className="mb-6">
            <SpringRegistrationSummary summary={summary} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {SPRING_LEAGUE_ORGS.map((league) => (
              <section key={league} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-white">{getOrgDisplayName(league)}</h2>
                  <Link
                    href={`/admin/season-setup?org=${league}`}
                    className="text-sm font-semibold text-red-200 hover:text-red-100"
                  >
                    {league === "gonzales" ? "Edit in Gonzales" : "Edit in Ascension"}
                  </Link>
                </div>
                <AdminSeasonSetupChecklist targetOrg={league} readOnly />
              </section>
            ))}
          </div>
        </section>
      </main>
    );
  }

  const currentOrg = resolveAdminTargetOrg(org);
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
  const seasonMode = adminUser.isMaster ? await loadSeasonMode(currentOrg) : null;

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SEASON SETUP"
            currentOrg={currentOrg}
            currentPath={`/admin/season-setup?org=${currentOrg}`}
            orgSwitcherShowAllSites={false}
            springCombined={springCombined}
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

        {seasonMode ? (
          <div className="mb-6">
            <SeasonModeOverrideControl initial={seasonMode} />
          </div>
        ) : null}

        {canAccessAdminModule(role, "DIVISION_AGES") ? (
          <Link
            href={`/admin/season-setup/division-ages?org=${currentOrg}`}
            className="mb-6 block rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-600 sm:p-6"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Forecast</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Division Ages</h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">
              Cutoff dates, birthdate ranges, coverage warnings, and an eligibility lookup. Edit a proposed
              cutoff on the Forecast tab, including the birthdate timeline.
            </p>
          </Link>
        ) : null}

        <FallBallUmpirePayScheduleEditor
          targetOrg={currentOrg}
          canEdit={hasAdminRoleAtLeast(role, "ADMIN")}
        />
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <AdminSeasonSetupChecklist targetOrg={currentOrg} />
        </div>
      </section>
    </main>
  );
}
