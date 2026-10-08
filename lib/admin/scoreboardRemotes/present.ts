import type { ContentOrgId } from "@/lib/siteConfig";

import { normalizeScoreboardFieldName, scoreboardFieldHoldKey } from "@/lib/admin/scoreboardRemotes/fieldKey";

export const ADD_REMOTES_MESSAGE = "Add remotes for this park in Manage remotes.";

export const SCOREBOARD_CONTROLLER_STATUSES = ["ACTIVE", "MISSING", "REPAIR", "RETIRED"] as const;

export type ScoreboardControllerStatus = (typeof SCOREBOARD_CONTROLLER_STATUSES)[number];

export type RemoteControllerRecord = {
  id: string;
  venueId: string;
  label: string;
  homeFieldName: string | null;
  status: ScoreboardControllerStatus;
};

export type RemoteOpenCheckoutRecord = {
  id: string;
  controllerId: string;
  controllerLabel: string;
  venueId: string;
  scheduleDraftGameId: string | null;
  fieldName: string | null;
  side: "HOME" | "AWAY";
  volunteerName: string;
  whenLabel: string;
  matchup: string;
};

export type RemoteLegacyCheckout = {
  status: "in" | "out" | "returned";
  side: "home" | "away" | null;
  team: string | null;
  name: string | null;
  note: string | null;
};

export type RemoteTabGameInput = {
  id: string;
  organizationId: ContentOrgId;
  when: string;
  division: string;
  homeTeam: string;
  awayTeam: string;
  parkName: string;
  fieldName: string;
  venueId: string | null;
  leagueLabel: string;
  leaguePrimaryHex: string;
  badgeText: "#111827" | "#ffffff";
  isToday: boolean;
  legacyCheckout: RemoteLegacyCheckout;
};

export type GameDayRemoteHold = {
  label: string;
  volunteer: string;
  when: string;
  matchup: string;
};

export type GameDayRemoteChoice = {
  id: string;
  label: string;
  homeFieldName: string | null;
};

export type GameDayRemoteCheckout = {
  id: string;
  controllerId: string;
  label: string;
  side: "home" | "away";
  sideLabel: string;
  volunteerName: string;
};

export type GameDayRemoteGame = {
  id: string;
  organizationId: ContentOrgId;
  when: string;
  division: string;
  homeTeam: string;
  awayTeam: string;
  parkName: string;
  fieldName: string;
  leagueLabel: string;
  leaguePrimaryHex: string;
  badgeText: "#111827" | "#ffffff";
  isToday: boolean;
  mode: "inventory" | "legacy";
  legacyMessage: string | null;
  legacyCheckout: RemoteLegacyCheckout | null;
  openCheckouts: GameDayRemoteCheckout[];
  availableRemotes: GameDayRemoteChoice[];
  holds: GameDayRemoteHold[];
};

const EMPTY_LEGACY: RemoteLegacyCheckout = {
  status: "in",
  side: null,
  team: null,
  name: null,
  note: null,
};

/** Active remotes with no open checkout. Retired, missing, and repair stay off the list. */
export function remotesAvailableForCheckout<T extends { id: string; status: ScoreboardControllerStatus }>(
  controllers: readonly T[],
  openControllerIds: ReadonlySet<string>,
): T[] {
  return controllers.filter((controller) => controller.status === "ACTIVE" && !openControllerIds.has(controller.id));
}

function sideLabel(side: "HOME" | "AWAY", game: RemoteTabGameInput): string {
  return side === "HOME" ? game.homeTeam : game.awayTeam;
}

function holdFor(checkout: RemoteOpenCheckoutRecord): GameDayRemoteHold {
  return {
    label: checkout.controllerLabel,
    volunteer: checkout.volunteerName,
    when: checkout.whenLabel,
    matchup: checkout.matchup,
  };
}

export function buildRemoteTabGames(input: {
  games: readonly RemoteTabGameInput[];
  controllers: readonly RemoteControllerRecord[];
  openCheckouts: readonly RemoteOpenCheckoutRecord[];
}): GameDayRemoteGame[] {
  const countByVenue = new Map<string, number>();
  for (const controller of input.controllers) {
    countByVenue.set(controller.venueId, (countByVenue.get(controller.venueId) ?? 0) + 1);
  }
  const openControllerIds = new Set(input.openCheckouts.map((checkout) => checkout.controllerId));
  const openByGame = new Map<string, RemoteOpenCheckoutRecord[]>();
  for (const checkout of input.openCheckouts) {
    if (!checkout.scheduleDraftGameId) continue;
    const rows = openByGame.get(checkout.scheduleDraftGameId) ?? [];
    rows.push(checkout);
    openByGame.set(checkout.scheduleDraftGameId, rows);
  }

  return input.games.map((game) => {
    const remoteCount = game.venueId ? (countByVenue.get(game.venueId) ?? 0) : 0;
    const inventory = Boolean(game.venueId) && remoteCount > 0;
    const holdKey = scoreboardFieldHoldKey(game.venueId, game.fieldName);
    if (!inventory) {
      const legacyHolds = input.games
        .filter((other) => {
          if (other.id === game.id || other.legacyCheckout.status !== "out") return false;
          const otherKey = scoreboardFieldHoldKey(other.venueId, other.fieldName);
          return Boolean(holdKey) && otherKey === holdKey;
        })
        .map((other) => ({
          label: "Remote",
          volunteer: other.legacyCheckout.name || "a volunteer",
          when: other.when,
          matchup: `${other.awayTeam} at ${other.homeTeam}`,
        }));
      return {
        ...gameFields(game),
        mode: "legacy",
        legacyMessage: ADD_REMOTES_MESSAGE,
        legacyCheckout: game.legacyCheckout.status === "in" ? null : game.legacyCheckout,
        openCheckouts: [],
        availableRemotes: [],
        holds: legacyHolds,
      };
    }

    const mine = openByGame.get(game.id) ?? [];
    const mineIds = new Set(mine.map((checkout) => checkout.id));
    const available = remotesAvailableForCheckout(
      input.controllers.filter((controller) => controller.venueId === game.venueId),
      openControllerIds,
    ).sort((left, right) => {
      const leftHome = fieldMatches(left.homeFieldName, game.fieldName) ? 0 : 1;
      const rightHome = fieldMatches(right.homeFieldName, game.fieldName) ? 0 : 1;
      if (leftHome !== rightHome) return leftHome - rightHome;
      return left.label.localeCompare(right.label);
    });
    const holds = input.openCheckouts
      .filter((checkout) => {
        if (mineIds.has(checkout.id)) return false;
        if (checkout.scheduleDraftGameId === game.id) return false;
        const checkoutKey = scoreboardFieldHoldKey(checkout.venueId, checkout.fieldName);
        return Boolean(holdKey) && checkoutKey === holdKey;
      })
      .map(holdFor);

    return {
      ...gameFields(game),
      mode: "inventory",
      legacyMessage: null,
      legacyCheckout: null,
      openCheckouts: mine.map((checkout) => ({
        id: checkout.id,
        controllerId: checkout.controllerId,
        label: checkout.controllerLabel,
        side: checkout.side === "HOME" ? "home" : "away",
        sideLabel: sideLabel(checkout.side, game),
        volunteerName: checkout.volunteerName,
      })),
      availableRemotes: available.map((controller) => ({
        id: controller.id,
        label: controller.label,
        homeFieldName: controller.homeFieldName,
      })),
      holds,
    };
  });
}

function fieldMatches(homeFieldName: string | null, fieldName: string): boolean {
  const home = normalizeScoreboardFieldName(homeFieldName);
  const field = normalizeScoreboardFieldName(fieldName);
  return Boolean(home) && home === field;
}

function gameFields(game: RemoteTabGameInput): Omit<
  GameDayRemoteGame,
  "mode" | "legacyMessage" | "legacyCheckout" | "openCheckouts" | "availableRemotes" | "holds"
> {
  return {
    id: game.id,
    organizationId: game.organizationId,
    when: game.when,
    division: game.division,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    parkName: game.parkName,
    fieldName: game.fieldName,
    leagueLabel: game.leagueLabel,
    leaguePrimaryHex: game.leaguePrimaryHex,
    badgeText: game.badgeText,
    isToday: game.isToday,
  };
}

export function emptyLegacyCheckout(): RemoteLegacyCheckout {
  return { ...EMPTY_LEGACY };
}

export type RemoteInventoryRemote = {
  id: string;
  label: string;
  homeFieldName: string | null;
  status: ScoreboardControllerStatus;
  notes: string | null;
  openCheckout: { volunteerName: string; sinceLabel: string; side: "HOME" | "AWAY" } | null;
};

export type RemoteInventoryScreen = {
  canWrite: boolean;
  venues: Array<{
    id: string;
    name: string;
    remotes: RemoteInventoryRemote[];
  }>;
};
