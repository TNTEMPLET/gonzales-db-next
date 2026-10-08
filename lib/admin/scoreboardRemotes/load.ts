import "server-only";

import type { RemoteActor } from "@/lib/admin/scoreboardRemotes/auth";
import {
  buildRemoteTabGames,
  type GameDayRemoteGame,
  type RemoteControllerRecord,
  type RemoteInventoryScreen,
  type RemoteOpenCheckoutRecord,
  type RemoteTabGameInput,
} from "@/lib/admin/scoreboardRemotes/present";
import prisma from "@/lib/prisma";
import { formatPublicClock, formatPublicDateLabel } from "@/lib/schedule/publicSchedule";
import { dateKey } from "@/lib/scheduler/validation";

function centralClock(value: Date): string {
  return value.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function loadRemoteTabGames(games: readonly RemoteTabGameInput[]): Promise<GameDayRemoteGame[]> {
  const venueIds = [...new Set(games.map((game) => game.venueId).filter((id): id is string => Boolean(id)))];
  if (venueIds.length === 0) {
    return buildRemoteTabGames({ games, controllers: [], openCheckouts: [] });
  }

  const rows = await prisma.scoreboardController.findMany({
    where: { venueId: { in: venueIds } },
    select: {
      id: true,
      venueId: true,
      label: true,
      homeFieldName: true,
      status: true,
      checkouts: {
        where: { checkedInAt: null },
        select: {
          id: true,
          controllerId: true,
          scheduleDraftGameId: true,
          side: true,
          volunteerName: true,
          checkedOutAt: true,
          scheduleDraftGame: {
            select: {
              homeTeamName: true,
              awayTeamName: true,
              startTime: true,
              gameDate: true,
              field: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const controllers: RemoteControllerRecord[] = rows.map((row) => ({
    id: row.id,
    venueId: row.venueId,
    label: row.label,
    homeFieldName: row.homeFieldName,
    status: row.status,
  }));
  const openCheckouts: RemoteOpenCheckoutRecord[] = rows.flatMap((row) =>
    row.checkouts.map((checkout) => {
      const game = checkout.scheduleDraftGame;
      const whenLabel = game?.gameDate
        ? `${formatPublicDateLabel(dateKey(game.gameDate))} · ${formatPublicClock(game.startTime ?? "")}`
        : `Out since ${centralClock(checkout.checkedOutAt)}`;
      return {
        id: checkout.id,
        controllerId: checkout.controllerId,
        controllerLabel: row.label,
        venueId: row.venueId,
        scheduleDraftGameId: checkout.scheduleDraftGameId,
        fieldName: game?.field?.name ?? null,
        side: checkout.side,
        volunteerName: checkout.volunteerName,
        whenLabel,
        matchup: game ? `${game.awayTeamName} at ${game.homeTeamName}` : "a game",
      };
    }),
  );

  return buildRemoteTabGames({ games, controllers, openCheckouts });
}

export async function loadRemoteInventoryScreen(actor: RemoteActor): Promise<RemoteInventoryScreen> {
  const venues = await prisma.venue.findMany({
    where: actor.scope.kind === "all" ? {} : { id: { in: [...actor.scope.venueIds] } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      scoreboardControllers: {
        orderBy: { label: "asc" },
        select: {
          id: true,
          label: true,
          homeFieldName: true,
          status: true,
          notes: true,
          checkouts: {
            where: { checkedInAt: null },
            take: 1,
            select: { id: true, volunteerName: true, checkedOutAt: true, side: true },
          },
        },
      },
    },
  });

  return {
    canWrite: actor.scope.canWrite,
    venues: venues.map((venue) => ({
      id: venue.id,
      name: venue.name,
      remotes: venue.scoreboardControllers.map((remote) => {
        const open = remote.checkouts[0] ?? null;
        return {
          id: remote.id,
          label: remote.label,
          homeFieldName: remote.homeFieldName,
          status: remote.status,
          notes: remote.notes,
          openCheckout: open
            ? {
                id: open.id,
                volunteerName: open.volunteerName,
                sinceLabel: centralClock(open.checkedOutAt),
                side: open.side,
              }
            : null,
        };
      }),
    })),
  };
}

export async function venueHasRemotes(venueId: string | null): Promise<boolean> {
  if (!venueId) return false;
  const count = await prisma.scoreboardController.count({ where: { venueId } });
  return count > 0;
}
