import "server-only";

import { addCalendarDays, mondayOnOrBefore } from "@/lib/admin/dashboard/seasonPulse";
import type { FieldDeskGame } from "@/lib/admin/fieldDeskTypes";
import prisma from "@/lib/prisma";
import { loadPostedSeasonGames } from "@/lib/schedule/scoreableGamesLoad";
import { formatPublicClock, formatPublicDateLabel } from "@/lib/schedule/publicSchedule";
import { leagueCalendarDate } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

export type { FieldDeskGame };

function centralClock(value: Date): string {
  return value.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
}

function checkoutView(
  game: { homeTeam: string; awayTeam: string },
  row:
    | {
        scoreboardCheckedOutAt: Date | null;
        scoreboardCheckedInAt: Date | null;
        scoreboardCheckoutSide: string | null;
        scoreboardCheckoutName: string | null;
      }
    | undefined,
): Pick<FieldDeskGame, "checkoutStatus" | "checkoutSide" | "checkoutTeam" | "checkoutName" | "checkoutNote"> {
  const side = row?.scoreboardCheckoutSide === "home" || row?.scoreboardCheckoutSide === "away"
    ? row.scoreboardCheckoutSide
    : null;
  const team = side === "home" ? game.homeTeam : side === "away" ? game.awayTeam : null;
  const volunteer = row?.scoreboardCheckoutName?.trim() || null;
  if (!row?.scoreboardCheckedOutAt || !side) {
    return { checkoutStatus: "in", checkoutSide: null, checkoutTeam: null, checkoutName: null, checkoutNote: null };
  }
  if (!row.scoreboardCheckedInAt) {
    return {
      checkoutStatus: "out",
      checkoutSide: side,
      checkoutTeam: team,
      checkoutName: volunteer,
      checkoutNote: `Out since ${centralClock(row.scoreboardCheckedOutAt)}`,
    };
  }
  return {
    checkoutStatus: "returned",
    checkoutSide: side,
    checkoutTeam: team,
    checkoutName: volunteer,
    checkoutNote: `Returned at ${centralClock(row.scoreboardCheckedInAt)}`,
  };
}

export async function loadFieldDeskGames(
  org: ContentOrgId,
  asOf: Date = new Date(),
): Promise<{ games: FieldDeskGame[]; parks: string[] }> {
  const today = leagueCalendarDate(asOf);
  const weekStart = mondayOnOrBefore(today);
  const weekEnd = addCalendarDays(weekStart, 6);
  const [{ games: postedGames }, catalog] = await Promise.all([
    loadPostedSeasonGames(org),
    prisma.schedulePark.findMany({
      where: { organizationId: org, isActive: true },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const weekGames = postedGames.filter((game) => game.dateKey >= weekStart && game.dateKey <= weekEnd);
  const parks = [...new Set([...catalog.map((park) => park.name), ...weekGames.map((game) => game.parkName)])]
    .map((name) => name.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (weekGames.length === 0) return { games: [], parks };

  const names = await prisma.scheduleDraftGame.findMany({
    where: { id: { in: weekGames.map((game) => game.id) }, organizationId: org },
    select: {
      id: true,
      fieldId: true,
      parkId: true,
      scoreboardCheckedOutAt: true,
      scoreboardCheckedInAt: true,
      scoreboardCheckoutSide: true,
      scoreboardCheckoutName: true,
    },
  });
  const checkoutById = new Map(names.map((row) => [row.id, row]));

  const deskGames = weekGames.map((game) => {
    const row = checkoutById.get(game.id);
    const fieldKey = row?.fieldId || `${row?.parkId || game.parkName}:${game.fieldName}`;
    return {
      id: game.id,
      dateKey: game.dateKey,
      when: `${formatPublicDateLabel(game.dateKey)} · ${formatPublicClock(game.startTime)}`,
      ageGroup: game.ageGroup,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      parkName: game.parkName,
      fieldName: game.fieldName,
      fieldKey,
      ...checkoutView(game, row),
      isToday: game.dateKey === today,
    };
  });
  const heldByField = new Map<string, (typeof deskGames)[number]>();
  for (const game of deskGames) {
    if (game.checkoutStatus === "out") heldByField.set(game.fieldKey, game);
  }

  return {
    parks,
    games: deskGames.map(({ fieldKey, ...game }) => {
      const holder = heldByField.get(fieldKey);
      return {
        ...game,
        controllerHold:
          holder && holder.id !== game.id
            ? {
                when: holder.when,
                volunteer: holder.checkoutName || "a volunteer",
                matchup: `${holder.awayTeam} at ${holder.homeTeam}`,
              }
            : null,
      };
    }),
  };
}
