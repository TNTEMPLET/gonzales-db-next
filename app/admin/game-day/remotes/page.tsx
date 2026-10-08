import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import ManageRemotes from "@/components/admin/gameDay/ManageRemotes";
import { deniedGameDayRedirect, directorGameDayOrg } from "@/lib/admin/gameDay/landing";
import { mayLoadLeagueGameDay } from "@/lib/admin/gameDay/parks";
import { gameDayMembershipOrgs, viewerLandsOnGameDay } from "@/lib/admin/gameDay/session";
import { remoteActorFromCookies } from "@/lib/admin/scoreboardRemotes/auth";
import { loadRemoteInventoryScreen } from "@/lib/admin/scoreboardRemotes/load";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Remotes | ${site.name}`,
    description: "Scoreboard remotes at each park, and who has one out.",
  };
}

export default async function ManageRemotesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; park?: string }>;
}) {
  const { org, park } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const adminUser = await getAdminUserFromCookieToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  const back = new URLSearchParams({ org: currentOrg, tab: "controllers" });
  if (park?.trim()) back.set("park", park.trim());
  const backHref = `/admin/game-day?${back.toString()}`;

  if (!adminUser) {
    redirect(`/admin/login?next=${encodeURIComponent(`/admin/game-day/remotes?org=${currentOrg}`)}`);
  }

  const role = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, currentOrg);
  if (!mayLoadLeagueGameDay(role) && !adminUser.isMaster) {
    const soleDirector = await viewerLandsOnGameDay(adminUser);
    const membershipOrg = soleDirector
      ? directorGameDayOrg({
          requestedOrg: null,
          membershipOrgs: await gameDayMembershipOrgs(adminUser.id),
        })
      : null;
    const next = deniedGameDayRedirect({
      soleDirector,
      membershipOrg,
      currentOrg,
    });
    if (next) redirect(next.replace("/admin/game-day", "/admin/game-day/remotes"));
    return (
      <main className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-950">
        <h1 className="text-2xl font-bold">Remotes</h1>
        <p className="mt-3 text-base text-neutral-800">You do not have Game Day access for this league.</p>
      </main>
    );
  }

  const actor = await remoteActorFromCookies(currentOrg);
  if (!actor) {
    return (
      <main className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-950">
        <h1 className="text-2xl font-bold">Remotes</h1>
        <p className="mt-3 text-base text-neutral-800">You do not have Game Day access for this league.</p>
      </main>
    );
  }

  const screen = await loadRemoteInventoryScreen(actor);
  return <ManageRemotes orgId={currentOrg} screen={screen} backHref={backHref} />;
}
