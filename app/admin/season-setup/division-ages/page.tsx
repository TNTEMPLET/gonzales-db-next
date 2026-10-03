import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import DivisionAgesExplorer from "@/components/admin/DivisionAgesExplorer";
import DivisionAgesWorkspace from "@/components/admin/DivisionAgesWorkspace";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getPrimaryLiveContentOrg, getSeasonConfigForOrg } from "@/lib/seasonConfig";
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
    description: "Cutoff dates, division birthdate ranges, and a birthdate eligibility lookup.",
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
  const requestedOrg = isContentOrgId(org) ? org : null;
  const showAll = masterMode && requestedOrg == null;
  const orgs: ContentOrgId[] = !masterMode
    ? [getDefaultContentOrg()]
    : showAll
      ? [...CONTENT_ORGS]
      : [requestedOrg as ContentOrgId];

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  const returnPath = showAll
    ? "/admin/season-setup/division-ages"
    : `/admin/season-setup/division-ages?org=${orgs[0]}`;

  if (!adminUser) {
    redirect(`/admin/login?next=${encodeURIComponent(returnPath)}`);
  }

  const checkedOrgs = showAll ? CONTENT_ORGS : orgs;
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
  const headerOrg = showAll ? null : orgs[0];
  const hubOrg = headerOrg ?? getPrimaryLiveContentOrg();
  const { defaultSeasonYear, seasonYears } = seasonYearChoices(orgs);

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="DIVISION AGES"
            currentOrg={headerOrg}
            currentPath={returnPath}
            orgSwitcherShowAllSites
            allowRolePreview={hasAdminRoleAtLeast(displayRole, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
            moduleHubHref={`/admin/season-setup?org=${hubOrg}`}
            moduleHubLabel="Season Setup"
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Division Ages</h1>
          <p className="max-w-3xl text-zinc-400">
            Cutoff dates, birthdate ranges, coverage warnings, and an eligibility lookup.
            {canEdit ? " Admins can edit birthdates, save this season, and change league defaults." : ""}
          </p>
        </div>
        {canEdit ? (
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
        )}
      </section>
    </main>
  );
}
