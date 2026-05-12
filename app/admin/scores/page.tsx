import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import AdminGamesImportManager from "@/components/admin/AdminGamesImportManager";
import AdminScoresManager from "@/components/admin/AdminScoresManager";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import { fetchGames } from "@/lib/fetchGames";
import prisma from "@/lib/prisma";
import {
  getAssignrLeagueId,
  getSiteConfig,
  resolveAdminTargetOrg,
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
  const orgId = resolveAdminTargetOrg(org);
  const leagueId = getAssignrLeagueId(orgId);

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/scores");
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    orgId,
  );
  const role = effectiveRole ?? toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "SCORES")) {
    redirect("/admin?denied=scores");
  }

  const [scores, games] = await Promise.all([
    prisma.gameScore.findMany({
      where: { organizationId: orgId },
      select: {
        gameExternalId: true,
        homeScore: true,
        awayScore: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    fetchGames({
      startDate: "2026-03-01",
      endDate: "2026-06-30",
      leagueId,
    }),
  ]);

  const scoreEntryGames = buildScoreEntryGames(games);

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SCORE ENTRY"
            currentOrg={orgId}
            currentPath="/admin/scores"
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
          />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Enter Game Scores
          </h1>
          <p className="text-zinc-400 max-w-2xl">
            Save final scores for completed games. Standings update from these
            scores by age group.
          </p>
        </div>

        <AdminScoresManager
          games={scoreEntryGames}
          existingScores={scores}
          targetOrg={orgId}
        />
        <AdminGamesImportManager targetOrg={orgId} />
      </section>
    </main>
  );
}
