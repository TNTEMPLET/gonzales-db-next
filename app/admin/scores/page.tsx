import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import {
  fetchAssignrGamesForScope,
  assignrHubHref,
  resolveAdminAssignrScope,
} from "@/lib/admin/assignrOrgScope";
import AdminGamesImportManager from "@/components/admin/AdminGamesImportManager";
import AdminScoresManager from "@/components/admin/AdminScoresManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import {
  CONTENT_ORGS,
  getDefaultContentOrg,
  getSiteConfig,
  isMasterDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";
import { buildScoreEntryGames } from "@/lib/admin/scoreEntryGames";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Game Scores | ${site.name}`,
    description: "Enter game scores and keep league standings current.",
  };
}

export default async function AdminScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const masterMode = isMasterDeployment();
  const requestedOrg =
    org && CONTENT_ORGS.includes(org as ContentOrgId)
      ? (org as ContentOrgId)
      : null;
  const scope = resolveAdminAssignrScope(org);
  const currentOrg = masterMode ? requestedOrg : getDefaultContentOrg();

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/scores");
  }

  const effectiveRole = currentOrg
    ? await getEffectiveAdminRoleForOrg(
        adminUser.id,
        adminUser.isMaster,
        currentOrg,
      )
    : toAdminRole(adminUser.role, adminUser.isMaster);
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  const orgRoles = await Promise.all(
    CONTENT_ORGS.map((orgId) =>
      getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, orgId),
    ),
  );
  const canAccessScores =
    canAccessAdminModule(role, "SCORES") ||
    (masterMode &&
      !currentOrg &&
      orgRoles.some(
        (orgRole) => orgRole && canAccessAdminModule(orgRole, "SCORES"),
      ));
  if (!canAccessScores) {
    redirect("/admin?denied=scores");
  }

  const assignrHubOrg = currentOrg ?? getDefaultContentOrg();
  const canAccessAssignr =
    canAccessAdminModule(role, "ASSIGNR") ||
    (masterMode &&
      !currentOrg &&
      orgRoles.some(
        (orgRole) => orgRole && canAccessAdminModule(orgRole, "ASSIGNR"),
      ));

  const [scores, games] = await Promise.all([
    prisma.gameScore.findMany({
      where:
        scope === "all"
          ? { organizationId: { in: [...CONTENT_ORGS] } }
          : { organizationId: scope },
      select: {
        gameExternalId: true,
        homeScore: true,
        awayScore: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    fetchAssignrGamesForScope({
      scope,
      startDate: "2026-03-01",
      endDate: "2026-06-30",
    }),
  ]);

  const scoreEntryGames = buildScoreEntryGames(games, scope);

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <ScoresPageHeader
          allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
          allowViewByUser={adminUser.isMaster}
          currentOrg={currentOrg}
          moduleHubHref={canAccessAssignr ? assignrHubHref(assignrHubOrg) : undefined}
        />

        <AdminScoresManager
          games={scoreEntryGames}
          existingScores={scores}
          scope={scope}
        />
        <AdminGamesImportManager scope={scope} />
      </section>
    </main>
  );
}

function ScoresPageHeader({
  currentOrg,
  allowRolePreview,
  allowViewByUser,
  moduleHubHref,
}: {
  currentOrg: ContentOrgId | null;
  allowRolePreview: boolean;
  allowViewByUser: boolean;
  moduleHubHref?: string;
}) {
  return (
    <div className="mb-8">
      <AdminSectionHeader
        badge="SCORE ENTRY"
        currentOrg={currentOrg}
        currentPath="/admin/scores"
        allowRolePreview={allowRolePreview}
        allowViewByUser={allowViewByUser}
        moduleHubHref={moduleHubHref}
        moduleHubLabel="Assignr Hub"
      />
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
        Enter Game Scores
      </h1>
      <p className="text-zinc-400 max-w-2xl">
        Save final scores for completed games. Standings update from these scores
        by age group.
      </p>
    </div>
  );
}
