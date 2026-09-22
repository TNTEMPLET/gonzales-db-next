import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import ScoresHub from "@/components/admin/scores/ScoresHub";
import { resolveAdminAssignrScope } from "@/lib/admin/assignrOrgScope";
import { listUnifiedScoreGames } from "@/lib/admin/unifiedScoreSources";
import { canAccessAdminModule, hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Scores & Standings | ${site.name}`,
    description: "Enter game scores, view logs, and keep standings current.",
  };
}

export default async function ScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const scope = resolveAdminAssignrScope(org);
  const season = getSeasonConfigForOrg(currentOrg);
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect(`/admin/login?next=/admin/scores?org=${currentOrg}`);
  }

  const effectiveRole = await getEffectiveAdminRoleForOrg(
    adminUser.id,
    adminUser.isMaster,
    currentOrg,
  );
  const role: AdminRole = effectiveRole ?? (adminUser.isMaster ? "MASTER_ADMIN" : "PARK_DIRECTOR");

  if (!canAccessAdminModule(role, "SCORES")) {
    redirect("/admin?denied=scores");
  }

  let games: Awaited<ReturnType<typeof listUnifiedScoreGames>>["games"] = [];
  let connections: Awaited<ReturnType<typeof listUnifiedScoreGames>>["connections"] = [];
  let loadError = "";
  try {
    const payload = await listUnifiedScoreGames({
      scope,
      seasonYear: season.year,
    });
    games = payload.games;
    connections = payload.connections;
  } catch (error: unknown) {
    console.error("[admin-scores] Failed to load scoreable games", error);
    loadError = "Could not load this season's scheduled games. File import and GameChanger stay available.";
  }

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <AdminSectionHeader
            badge="SCORES & STANDINGS"
            currentOrg={currentOrg}
            currentPath={`/admin/scores?org=${currentOrg}`}
            allowRolePreview={hasAdminRoleAtLeast(role, "ADMIN")}
            allowViewByUser={adminUser.isMaster}
          />
          <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">Scores & Standings</h1>
          <p className="max-w-3xl text-zinc-400">
            Enter finals for {season.label} league games. GameChanger and file import are on the other tabs.
          </p>
        </div>

        {loadError ? (
          <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
            {loadError}
          </div>
        ) : null}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
          <ScoresHub
            games={games}
            connections={connections}
            scope={scope}
            seasonYear={season.year}
            seasonLabel={season.label}
          />
        </div>
      </section>
    </main>
  );
}
