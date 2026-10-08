import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import GameDayView from "@/components/admin/gameDay/GameDayView";
import { loadGameDayPage } from "@/lib/admin/gameDay/loadGameDayPage";
import { parseGameDayDate, parseGameDayTab } from "@/lib/admin/gameDay/tabs";
import { viewerLandsOnGameDay } from "@/lib/admin/gameDay/session";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { canAccessAdminModule } from "@/lib/auth/adminRoles";
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
  const allowed =
    Boolean(role && canAccessAdminModule(role, "GAME_DAY")) ||
    (await viewerLandsOnGameDay(adminUser));
  if (!allowed) redirect("/admin?denied=game-day");

  const data = await loadGameDayPage({
    adminUserId: adminUser.id,
    isMaster: adminUser.isMaster,
    org: currentOrg,
    day: parseGameDayDate(day, leagueCalendarDate()),
    parkId: park?.trim() || null,
    tab: parseGameDayTab(tab),
  });

  return <GameDayView data={data} />;
}
