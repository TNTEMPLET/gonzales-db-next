import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { assignrHubHref, resolveAdminAssignrScope } from "@/lib/admin/assignrOrgScope";
import { listUnifiedScoreGames } from "@/lib/admin/unifiedScoreSources";
import AdminGamesImportManager from "@/components/admin/AdminGamesImportManager";
import AdminScoresManager from "@/components/admin/AdminScoresManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { SEASON_END_DATE, SEASON_START_DATE } from "@/lib/seasonConfig";
import { CONTENT_ORGS, getDefaultContentOrg, getSiteConfig, isMasterDeployment, type ContentOrgId } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return { title: `Game Scores | ${site.name}`, description: "Manage league and tournament scores from one workflow." };
}
export default async function AdminScoresPage({ searchParams }: { searchParams: Promise<{ org?: string; seasonYear?: string }> }) {
  const { org, seasonYear: rawSeasonYear } = await searchParams;
  const masterMode = isMasterDeployment();
  const requestedOrg = org && CONTENT_ORGS.includes(org as ContentOrgId) ? (org as ContentOrgId) : null;
  const scope = resolveAdminAssignrScope(org);
  const currentOrg = masterMode ? requestedOrg : getDefaultContentOrg();
  const seasonYear = Number.parseInt(rawSeasonYear || String(new Date().getFullYear()), 10);
  const safeSeasonYear = Number.isFinite(seasonYear) ? seasonYear : new Date().getFullYear();
  const cookieStore = await cookies();
  const adminUser = await getAdminUserFromCookieToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!adminUser) redirect("/admin/login?next=/admin/scores");
  const effectiveRole = currentOrg ? await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, currentOrg) : toAdminRole(adminUser.role, adminUser.isMaster);
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  const orgRoles = await Promise.all(CONTENT_ORGS.map((orgId) => getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, orgId)));
  const canAccessScores = canAccessAdminModule(role, "SCORES") || (masterMode && !currentOrg && orgRoles.some((orgRole) => orgRole && canAccessAdminModule(orgRole, "SCORES")));
  if (!canAccessScores) redirect("/admin?denied=scores");
  const canAccessAssignr = canAccessAdminModule(role, "ASSIGNR") || (masterMode && !currentOrg && orgRoles.some((orgRole) => orgRole && canAccessAdminModule(orgRole, "ASSIGNR")));
  const payload = await listUnifiedScoreGames({ scope, seasonYear: safeSeasonYear, startDate: SEASON_START_DATE, endDate: SEASON_END_DATE });
  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <ScoresPageHeader currentOrg={currentOrg} allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")} allowViewByUser={adminUser.isMaster} moduleHubHref={canAccessAssignr ? assignrHubHref(currentOrg ?? getDefaultContentOrg()) : undefined} />
        <AdminScoresManager games={payload.games} connections={payload.connections} scope={scope} seasonYear={safeSeasonYear} />
        <AdminGamesImportManager scope={scope} />
      </section>
    </main>
  );
}
function ScoresPageHeader({ currentOrg, allowRolePreview, allowViewByUser, moduleHubHref }: { currentOrg: ContentOrgId | null; allowRolePreview: boolean; allowViewByUser: boolean; moduleHubHref?: string }) {
  return (
    <div className="mb-8">
      <AdminSectionHeader badge="SCORES" currentOrg={currentOrg} currentPath="/admin/scores" allowRolePreview={allowRolePreview} allowViewByUser={allowViewByUser} moduleHubHref={moduleHubHref} moduleHubLabel="Assignr Hub" />
      <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Manage Scores</h1>
      <p className="max-w-3xl text-zinc-400">Use one Master workflow for league games, tournament-only brackets, manual score entry, and GameChanger scoreboard imports.</p>
    </div>
  );
}
