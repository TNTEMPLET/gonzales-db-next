import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import GameDayView from "@/components/admin/gameDay/GameDayView";
import LegacyFieldDeskHash from "@/components/admin/gameDay/LegacyFieldDeskHash";
import { deniedGameDayRedirect, directorGameDayOrg } from "@/lib/admin/gameDay/landing";
import { loadGameDayPage } from "@/lib/admin/gameDay/loadGameDayPage";
import { mayLoadLeagueGameDay } from "@/lib/admin/gameDay/parks";
import { gameDayMembershipOrgs, viewerLandsOnGameDay } from "@/lib/admin/gameDay/session";
import { parseGameDayDate, parseGameDayTab } from "@/lib/admin/gameDay/tabs";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { leagueCalendarDate } from "@/lib/seasonConfig";
import { getSiteConfig, resolveAdminTargetOrg } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Game Day | ${site.name}`,
    description: "Today’s games, umpire cards, scores, and umpire pay at the park.",
  };
}

export default async function GameDayPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; park?: string; day?: string; tab?: string }>;
}) {
  const { org, park, day, tab } = await searchParams;
  const currentOrg = resolveAdminTargetOrg(org);
  const cookieStore = await cookies();
  const adminUser = await getAdminUserFromCookieToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  if (!adminUser) {
    redirect(`/admin/login?next=${encodeURIComponent(`/admin/game-day?org=${currentOrg}`)}`);
  }

  const role = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, currentOrg);
  if (!mayLoadLeagueGameDay(role)) {
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
    if (next) redirect(next);
    return (
      <main className="min-h-screen bg-neutral-100 px-4 py-8 text-neutral-950">
        <h1 className="text-2xl font-bold">Game Day</h1>
        <p className="mt-3 text-base text-neutral-800">You do not have Game Day access for this league.</p>
      </main>
    );
  }

  const data = await loadGameDayPage({
    adminUserId: adminUser.id,
    isMaster: adminUser.isMaster,
    org: currentOrg,
    day: parseGameDayDate(day, leagueCalendarDate()),
    parkId: park?.trim() || null,
    tab: parseGameDayTab(tab),
  });

  return (
    <>
      <Suspense fallback={null}>
        <LegacyFieldDeskHash />
      </Suspense>
      <GameDayView data={data} />
    </>
  );
}
