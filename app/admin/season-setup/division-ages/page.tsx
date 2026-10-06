import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { DivisionAgesBuilder } from "@/components/admin/DivisionAgesBuilder";
import DivisionAgesExplorer, { DivisionAgesModeTabs } from "@/components/admin/DivisionAgesExplorer";
import DivisionAgesForecast from "@/components/admin/DivisionAgesForecast";
import DivisionAgesWorkspace from "@/components/admin/DivisionAgesWorkspace";
import SpringCombinedDivisions from "@/components/admin/SpringCombinedDivisions";
import {
  canOfferSpringCombined,
  isSpringCombinedParam,
  resolveDivisionAgesView,
  SPRING_COMBINED_SAVE_HINT,
  SPRING_LEAGUE_ORGS,
  springLeaguesAreLive,
} from "@/lib/admin/springCombined/view";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getLiveContentOrgs, getPrimaryLiveContentOrg, getSeasonConfigForOrg } from "@/lib/seasonConfig";
import {
  CONTENT_ORGS,
  getDefaultContentOrg,
  getSiteConfig,
  isContentOrgId,
  isMasterDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Division Ages | ${site.name}`,
    description: "Cutoff dates, division birthdate ranges, an eligibility lookup, and a counts-only forecast.",
  };
}

function seasonYearChoices(orgs: ContentOrgId[]): { defaultSeasonYear: number; seasonYears: number[] } {
  const configured = orgs.map((org) => getSeasonConfigForOrg(org).year);
  const defaultSeasonYear = Math.max(...configured) + 1;
  const start = Math.min(...configured) - 1;
  const end = defaultSeasonYear + 3;
  const seasonYears: number[] = [];
  for (let year = start; year <= end; year += 1) seasonYears.push(year);
  return { defaultSeasonYear, seasonYears };
}

export default async function DivisionAgesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const masterMode = isMasterDeployment();
  const liveOrgs = getLiveContentOrgs();
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  const requestedContentOrg = isContentOrgId(org) ? org : null;
  const springRequested = isSpringCombinedParam(org);
  const showAll = masterMode && !springRequested && requestedContentOrg == null;
  const defaultOrgs: ContentOrgId[] = !masterMode
    ? [getDefaultContentOrg()]
    : showAll
      ? [...CONTENT_ORGS]
      : [requestedContentOrg as ContentOrgId];
  const returnPath = springRequested
    ? "/admin/season-setup/division-ages?org=spring"
    : showAll
      ? "/admin/season-setup/division-ages"
      : `/admin/season-setup/division-ages?org=${defaultOrgs[0]}`;

  if (!adminUser) {
    redirect(`/admin/login?next=${encodeURIComponent(returnPath)}`);
  }

  const agesView = resolveDivisionAgesView({
    isMaster: adminUser.isMaster,
    masterDeployment: masterMode,
    requestedOrg: org,
    liveOrgs,
  });
  if (agesView === "denied") {
    redirect("/admin?denied=division-ages");
  }

  const combined = agesView === "combined";
  const orgs: ContentOrgId[] = combined ? [...SPRING_LEAGUE_ORGS] : defaultOrgs;

  const checkedOrgs = combined ? [...SPRING_LEAGUE_ORGS] : showAll ? CONTENT_ORGS : orgs;
  const roleEntries = await Promise.all(
    checkedOrgs.map(async (orgId) => {
      const role = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, orgId);
      const resolved: AdminRole = role ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");
      return [orgId, resolved] as const;
    }),
  );
  const allowing = roleEntries.find(([, role]) =>
    canAccessAdminModule(role, "DIVISION_AGES", { masterDeployment: masterMode }),
  );

  if (!allowing) {
    redirect("/admin?denied=division-ages");
  }

  const displayRole = allowing[1];
  const canEdit = hasAdminRoleAtLeast(displayRole, "ADMIN");
  const headerOrg = combined || showAll ? null : orgs[0];
  const hubOrg = combined ? "spring" : (headerOrg ?? getPrimaryLiveContentOrg());
  const headerPath = returnPath;
  const { defaultSeasonYear, seasonYears } = seasonYearChoices(orgs);
  const offerSpring = canOfferSpringCombined({ isMaster: adminUser.isMaster, masterDeployment: masterMode });
  const springCombined = offerSpring
    ? { selected: combined, suggested: !springLeaguesAreLive(liveOrgs) }
    : null;

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="DIVISION AGES"
            currentOrg={headerOrg}
            currentPath={headerPath}
            orgSwitcherShowAllSites
            springCombined={springCombined}
            allowRolePreview={hasAdminRoleAtLeast(displayRole, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
            moduleHubHref={`/admin/season-setup?org=${hubOrg}`}
            moduleHubLabel="Season Setup"
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Division Ages</h1>
          <p className="max-w-3xl text-zinc-400">
            {combined
              ? `Gonzales DYB and Ascension LL together. Every Spring division is in one table, with the league in the name. ${SPRING_COMBINED_SAVE_HINT}. The Division Builder review leads to that save. Switch to Gonzales DYB or Ascension LL to work on one league.`
              : "The Division Builder starts blank so any admin can try ages, cutoffs, and player counts. It stays in this browser and does not change registration or the saved table. The Divisions tab is the saved cutoff, birthdate ranges, and eligibility lookup. The Forecast tab compares this season's counts with a proposed cutoff."}
            {!combined && canEdit ? " Admins can edit birthdates, save this season, and change league defaults." : ""}
          </p>
        </div>
        <DivisionAgesModeTabs
          builder={
            <DivisionAgesBuilder
              orgs={orgs}
              defaultSeasonYear={defaultSeasonYear}
              seasonYears={seasonYears}
              showSpringTemplate={combined}
            />
          }
          divisions={
            combined ? (
              <SpringCombinedDivisions defaultSeasonYear={defaultSeasonYear} seasonYears={seasonYears} />
            ) : canEdit ? (
              <DivisionAgesWorkspace
                orgs={orgs}
                defaultSeasonYear={defaultSeasonYear}
                seasonYears={seasonYears}
              />
            ) : (
              <DivisionAgesExplorer
                orgs={orgs}
                defaultSeasonYear={defaultSeasonYear}
                seasonYears={seasonYears}
              />
            )
          }
          forecast={
            combined ? (
              <DivisionAgesForecast
                key="spring-combined"
                orgs={[...SPRING_LEAGUE_ORGS]}
                seasonYears={seasonYears}
                springCombined
              />
            ) : (
              <DivisionAgesForecast key={orgs.join(",")} orgs={orgs} seasonYears={seasonYears} />
            )
          }
        />
      </section>
    </main>
  );
}
