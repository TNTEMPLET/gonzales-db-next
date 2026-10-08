import "server-only";

import { addCalendarDays, mondayOnOrBefore } from "@/lib/admin/dashboard/seasonPulse";
import { gameIsRainedOut, type GameDayRainout } from "@/lib/admin/dashboard/gameDay";
import { loadFieldDeskGames, fieldDeskCheckoutFields } from "@/lib/admin/fieldDesk";
import type { FieldDeskGame } from "@/lib/admin/fieldDeskTypes";
import { withControllerHolds } from "@/lib/admin/gameDay/controllers";
import { crewForGame } from "@/lib/admin/gameDay/crew";
import { badgeTextColor } from "@/lib/admin/gameDay/display";
import { DEFAULT_FALL_BALL_PAY_SCHEDULE, isFallBallOrg } from "@/lib/admin/fallBallUmpirePay";
import { loadFallBallPaySchedule } from "@/lib/admin/fallBallUmpirePayStore";
import { gamesAtMyParks } from "@/lib/admin/parkDirector/gamesAtMyParks";
import { gameDayDataMode, chooseGameDayPark, mayLoadLeagueGameDay, type GameDayParkChoice } from "@/lib/admin/gameDay/parks";
import { mergeOwed, owedAtParks, payTotal } from "@/lib/admin/gameDay/pay";
import { rainoutBannerLines, type RainoutBannerInput } from "@/lib/admin/gameDay/rainout";
import type { GameDayCardGame, GameDayListGame, GameDayPageData, GameDayScoreGame } from "@/lib/admin/gameDay/types";
import { leagueSourceKey } from "@/lib/admin/unifiedScoreKeys";
import type { Game } from "@/lib/fetchGames";
import { fetchGames } from "@/lib/fetchGames";
import { getAllActiveOrgAlerts, type OrgAlertRecord } from "@/lib/orgAlerts";
import prisma from "@/lib/prisma";
import { formatPublicClock, formatPublicDateLabel } from "@/lib/schedule/publicSchedule";
import { gamesReadyForScores } from "@/lib/admin/gameDay/scores";
import { leagueCalendarDate } from "@/lib/seasonConfig";
import {
  CONTENT_ORGS,
  getContentOrgBrandColors,
  getOrgDisplayName,
  hasAssignrLeagueId,
  getAssignrLeagueId,
  isContentOrgId,
  type ContentOrgId,
} from "@/lib/siteConfig";

import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";

type PostedGame = {
  id: string;
  organizationId: ContentOrgId;
  dateKey: string;
  startTime: string;
  division: string;
  homeTeam: string;
  awayTeam: string;
  venueId: string | null;
  venueName: string;
  parkName: string;
  fieldName: string;
  fieldKey: string;
  checkout: Pick<
    FieldDeskGame,
    "checkoutStatus" | "checkoutSide" | "checkoutTeam" | "checkoutName" | "checkoutNote"
  >;
};

function throughLabel(expiresAt: Date): string {
  const clock = expiresAt.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Through ${clock} CT`;
}

function rainoutFor(alert: OrgAlertRecord | undefined): GameDayRainout | null {
  if (!alert || (!alert.allParksOut && alert.venues.length === 0)) return null;
  return {
    allParksOut: alert.allParksOut,
    parks: alert.venues,
    throughDate: leagueCalendarDate(alert.expiresAt),
  };
}

function listGame(game: PostedGame, rainedOut: boolean): GameDayListGame {
  const brand = getContentOrgBrandColors(game.organizationId);
  const place = game.fieldName ? `${game.parkName} · ${game.fieldName}` : game.parkName;
  return {
    id: game.id,
    when: `${formatPublicDateLabel(game.dateKey)} · ${formatPublicClock(game.startTime)}`,
    division: game.division,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    place,
    leagueLabel: getOrgDisplayName(game.organizationId),
    leaguePrimaryHex: brand.primaryHex,
    badgeText: badgeTextColor(brand.primaryHex),
    rainedOut,
  };
}

function toControllerGame(game: PostedGame): FieldDeskGame & { fieldKey: string } {
  return {
    id: game.id,
    organizationId: game.organizationId,
    dateKey: game.dateKey,
    startTime: game.startTime,
    when: `${formatPublicDateLabel(game.dateKey)} · ${formatPublicClock(game.startTime)}`,
    ageGroup: game.division,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    parkName: game.parkName,
    fieldName: game.fieldName,
    ...game.checkout,
    controllerHold: null,
    isToday: false,
    fieldKey: game.fieldKey,
  };
}

async function loadAssignr(orgs: readonly ContentOrgId[], day: string): Promise<{
  byOrg: Partial<Record<ContentOrgId, Game[]>>;
  failed: number;
  attempted: number;
}> {
  const byOrg: Partial<Record<ContentOrgId, Game[]>> = {};
  let failed = 0;
  let attempted = 0;
  await Promise.all(
    orgs.map(async (org) => {
      if (!hasAssignrLeagueId(org)) {
        byOrg[org] = [];
        return;
      }
      attempted += 1;
      try {
        byOrg[org] = await fetchGames({
          startDate: day,
          endDate: day,
          leagueId: getAssignrLeagueId(org),
          limit: 100,
          cache: "no-store",
        });
      } catch (error: unknown) {
        failed += 1;
        byOrg[org] = [];
        console.error(
          `[game-day] Assignr games failed for ${org}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );
  return { byOrg, failed, attempted };
}

export async function loadGameDayPage(input: {
  adminUserId: string;
  isMaster: boolean;
  org: ContentOrgId;
  day: string;
  parkId: string | null;
  tab: GameDayPageData["tab"];
}): Promise<GameDayPageData> {
  const role = await getEffectiveAdminRoleForOrg(input.adminUserId, input.isMaster, input.org);
  const mayLeague = mayLoadLeagueGameDay(role);
  const siteDirector = !input.isMaster && role === "PARK_DIRECTOR";

  const assignmentRows = siteDirector
    ? await prisma.parkDirectorAssignment.findMany({
        where: { adminUserId: input.adminUserId, active: true },
        select: { venueId: true, venue: { select: { name: true } } },
      })
    : [];
  const mode = gameDayDataMode({
    isMaster: input.isMaster,
    roleIsParkDirector: siteDirector,
    activeAssignmentCount: assignmentRows.length,
  });

  const weekStart = mondayOnOrBefore(input.day);
  const weekEnd = addCalendarDays(weekStart, 6);
  let posted: PostedGame[] = [];
  let parkChoices: GameDayParkChoice[] = [];
  let leagueControllerGames: FieldDeskGame[] | null = null;

  if (mode === "assigned") {
    parkChoices = assignmentRows.map((row) => ({
      id: row.venueId,
      label: row.venue.name,
    }));
    const weekGames = await gamesAtMyParks(input.adminUserId, { startDate: weekStart, endDate: weekEnd });
    const checkouts = weekGames.length
      ? await prisma.scheduleDraftGame.findMany({
          where: { id: { in: weekGames.map((game) => game.id) } },
          select: {
            id: true,
            fieldId: true,
            parkId: true,
            scoreboardCheckedOutAt: true,
            scoreboardCheckedInAt: true,
            scoreboardCheckoutSide: true,
            scoreboardCheckoutName: true,
          },
        })
      : [];
    const checkoutById = new Map(checkouts.map((row) => [row.id, row]));
    posted = weekGames.map((game) => {
      const row = checkoutById.get(game.id);
      const fieldKey = row?.fieldId || game.fieldId || `${row?.parkId || game.parkId}:${game.fieldName || ""}`;
      return {
        id: game.id,
        organizationId: game.organizationId,
        dateKey: game.gameDate,
        startTime: game.startTime,
        division: game.division || game.ageGroup || "",
        homeTeam: game.homeTeamName,
        awayTeam: game.awayTeamName,
        venueId: game.venueId,
        venueName: game.venueName,
        parkName: game.parkName,
        fieldName: game.fieldName || "",
        fieldKey,
        checkout: fieldDeskCheckoutFields(
          { homeTeam: game.homeTeamName, awayTeam: game.awayTeamName },
          row,
        ),
      };
    });
  } else if (mayLeague) {
    const desk = await loadFieldDeskGames(input.org);
    parkChoices = desk.parks.map((name) => ({ id: name, label: name }));
    leagueControllerGames = desk.games;
    posted = desk.games
      .filter((game) => game.dateKey >= weekStart && game.dateKey <= weekEnd)
      .map((game) => ({
        id: game.id,
        organizationId: game.organizationId,
        dateKey: game.dateKey,
        startTime: game.startTime,
        division: game.ageGroup,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        venueId: null,
        venueName: game.parkName,
        parkName: game.parkName,
        fieldName: game.fieldName,
        fieldKey: `${game.parkName}:${game.fieldName}`,
        checkout: {
          checkoutStatus: game.checkoutStatus,
          checkoutSide: game.checkoutSide,
          checkoutTeam: game.checkoutTeam,
          checkoutName: game.checkoutName,
          checkoutNote: game.checkoutNote,
        },
      }));
  }

  const choice = chooseGameDayPark(parkChoices, input.parkId);
  const selected = choice.parks.find((park) => park.id === choice.selectedId) ?? null;
  const inPark = (game: PostedGame) => {
    if (!selected) return false;
    if (mode === "assigned") return game.venueId === selected.id;
    return game.parkName === selected.id;
  };
  const weekAtPark = selected ? posted.filter(inPark) : [];
  const dayAtPark = weekAtPark.filter((game) => game.dateKey === input.day);

  const alerts = await getAllActiveOrgAlerts().catch((error: unknown) => {
    console.error("[game-day] Rainout status failed:", error instanceof Error ? error.message : error);
    return [] as OrgAlertRecord[];
  });
  const latest = new Map<string, OrgAlertRecord>();
  for (const alert of alerts) {
    if (!latest.has(alert.organizationId)) latest.set(alert.organizationId, alert);
  }
  const bannerAlerts: RainoutBannerInput[] = [];
  const rainouts = new Map<ContentOrgId, GameDayRainout | null>();
  const orgsForRain = new Set<ContentOrgId>(mode === "league" ? [input.org] : CONTENT_ORGS);
  for (const orgId of orgsForRain) {
    if (!isContentOrgId(orgId)) continue;
    const alert = latest.get(orgId);
    rainouts.set(orgId, rainoutFor(alert));
    if (!alert) continue;
    bannerAlerts.push({
      leagueLabel: getOrgDisplayName(orgId),
      allParksOut: alert.allParksOut,
      rainedOutParks: alert.allParksOut ? [] : alert.venues,
      throughLabel: alert.allParksOut || alert.venues.length > 0 ? throughLabel(alert.expiresAt) : null,
    });
  }
  const rainoutNames = selected
    ? [selected.label, ...dayAtPark.map((game) => game.parkName), ...weekAtPark.map((game) => game.parkName)]
    : [];
  const rainoutLines = rainoutBannerLines(bannerAlerts, rainoutNames);

  const scoreIds = dayAtPark.map((game) => game.id);
  const savedScores = scoreIds.length
    ? await prisma.gameScore.findMany({
        where: { gameExternalId: { in: scoreIds } },
        select: { organizationId: true, gameExternalId: true, homeScore: true, awayScore: true },
      })
    : [];
  const scoreByKey = new Map(savedScores.map((row) => [`${row.organizationId}:${row.gameExternalId}`, row]));

  let assignrByOrg: Partial<Record<ContentOrgId, Game[]>> = {};
  let assignrFailed = 0;
  let assignrAttempted = 0;
  if (selected) {
    const assignrOrgs = mode === "assigned" ? CONTENT_ORGS : [input.org];
    const loaded = await loadAssignr(assignrOrgs, input.day);
    assignrByOrg = loaded.byOrg;
    assignrFailed = loaded.failed;
    assignrAttempted = loaded.attempted;
  }
  const assignrGames = Object.values(assignrByOrg).flatMap((rows) => rows ?? []);
  const crewUnavailable = assignrAttempted > 0 && assignrFailed === assignrAttempted;
  const payError = !selected
    ? null
    : crewUnavailable
      ? "Umpire pay could not be loaded. Assignr is unavailable."
      : assignrFailed > 0
        ? "Some leagues did not answer. Pay below is incomplete."
        : null;

  const parkNames = selected
    ? [...new Set([selected.label, ...dayAtPark.map((game) => game.parkName), ...weekAtPark.map((game) => game.parkName)])]
    : [];

  const payParts: Awaited<ReturnType<typeof owedAtParks>>[] = [];
  if (selected && !crewUnavailable) {
    for (const orgId of mode === "assigned" ? CONTENT_ORGS : [input.org]) {
      const games = assignrByOrg[orgId] ?? [];
      if (games.length === 0) continue;
      let schedule = null;
      if (isFallBallOrg(orgId)) {
        try {
          schedule = await loadFallBallPaySchedule({ org: orgId });
        } catch (error: unknown) {
          schedule = DEFAULT_FALL_BALL_PAY_SCHEDULE;
          console.error(
            "[game-day] Fall Ball umpire rates failed:",
            error instanceof Error ? error.message : error,
          );
        }
      }
      payParts.push(owedAtParks(games, parkNames, { org: orgId, fallBallSchedule: schedule }));
    }
  }
  const payRows = mergeOwed(payParts);

  const todayGames: GameDayListGame[] = dayAtPark.map((game) =>
    listGame(game, gameIsRainedOut(game, rainouts.get(game.organizationId) ?? null, input.day)),
  );
  const cardGames: GameDayCardGame[] = dayAtPark.map((game) => ({
    ...listGame(game, gameIsRainedOut(game, rainouts.get(game.organizationId) ?? null, input.day)),
    parkName: game.parkName,
    fieldName: game.fieldName,
    crew: crewUnavailable
      ? []
      : crewForGame(
          {
            dateKey: game.dateKey,
            startTime: game.startTime,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            parkNames,
          },
          assignrGames,
        ),
  }));

  const scoreSplit = gamesReadyForScores(dayAtPark);
  const scoreSource = scoreSplit.ready;
  const scoreGames: GameDayScoreGame[] = scoreSource.map((game) => {
    const saved = scoreByKey.get(`${game.organizationId}:${game.id}`);
    const row = listGame(game, false);
    return {
      id: game.id,
      organizationId: game.organizationId,
      sourceKey: leagueSourceKey(),
      matchId: game.id,
      ageGroup: game.division,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      gameDate: `${game.dateKey}T12:00:00.000Z`,
      when: row.when,
      place: row.place,
      leagueLabel: row.leagueLabel,
      leaguePrimaryHex: row.leaguePrimaryHex,
      badgeText: row.badgeText,
      homeScore: saved?.homeScore ?? null,
      awayScore: saved?.awayScore ?? null,
    };
  });

  const todayKey = leagueCalendarDate();
  const controllerGames = (
    leagueControllerGames
      ? leagueControllerGames.filter((game) => (selected ? game.parkName === selected.id : false))
      : withControllerHolds(weekAtPark.map(toControllerGame))
  ).map((game) => ({
    ...game,
    isToday: game.dateKey === todayKey,
  }));

  return {
    org: input.org,
    day: input.day,
    dayLabel: formatPublicDateLabel(input.day),
    tab: input.tab,
    mode,
    parks: choice.parks,
    selectedParkId: choice.selectedId,
    selectedParkLabel: selected?.label ?? null,
    needsParkChoice: choice.needsChoice,
    rainoutLines,
    todayGames,
    cardGames,
    scoreGames,
    scoresClosedForPark: scoreSplit.closedForPark,
    controllerGames,
    payRows,
    payTotal: payTotal(payRows),
    payError,
    crewUnavailable,
    directorOnly: siteDirector,
    seasonSetupHref: `/admin/season-setup?org=${encodeURIComponent(input.org)}`,
  };
}
