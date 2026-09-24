import "server-only";

import type { AssignrSyncJobStatus } from "@prisma/client";

import { type GameDayRainout, type GameDayStatus } from "@/lib/admin/dashboard/gameDay";
import {
  buildOrgSeasonPicture,
  type OrgSeasonPicture,
} from "@/lib/admin/dashboard/seasonPulse";
import { getAllActiveOrgAlerts, type OrgAlertRecord } from "@/lib/orgAlerts";
import prisma from "@/lib/prisma";
import { loadPublicScheduleGames, loadPublicScheduleWindow } from "@/lib/schedule/publicScheduleLoad";
import { dateKey as utcDateKey } from "@/lib/scheduler/validation";
import { getSeasonConfigForOrg, leagueCalendarDate } from "@/lib/seasonConfig";
import { countOpenPlayerNameCollisions } from "@/lib/sportsConnect/playerNameCollisions";
import {
  getBracketOrgDisplayName,
  getOrgDisplayName,
  type ContentOrgId,
} from "@/lib/siteConfig";
import { DEFAULT_TOURNAMENT_INCOME_ORG, seasonYearFromDate, TOURNAMENT_INCOME_CATEGORY_LABELS } from "@/lib/tournament-income/constants";
import { summarizeTournamentIncome } from "@/lib/tournament-income/summary";

export type AssignrSyncView = {
  organizationId: ContentOrgId;
  status: AssignrSyncJobStatus | "NONE";
  atIso: string | null;
  successCount: number;
  failedCount: number;
  errorMessage: string | null;
};

export type OperationsView = {
  organizationId: ContentOrgId;
  conflictGames: number;
  nameCollisions: number;
  openEquipment: number;
};

export type DistrictIncomeView = {
  seasonYear: number;
  organizationLabel: string;
  grossCents: number;
  netCents: number;
  unmatchedCount: number;
  categories: { label: string; count: number; netCents: number }[];
};

export type InSeasonBoardData = {
  pictures: OrgSeasonPicture[];
  gameDays: GameDayStatus[];
  sync: AssignrSyncView[];
  operations: OperationsView[];
  district: DistrictIncomeView | null;
};

function latestAlert(alerts: OrgAlertRecord[], organizationId: string): OrgAlertRecord | null {
  return alerts.find((alert) => alert.organizationId === organizationId) ?? null;
}

function rainoutFromAlert(alert: OrgAlertRecord | null): GameDayRainout | null {
  if (!alert) return null;
  if (!alert.allParksOut && alert.venues.length === 0) return null;
  return {
    allParksOut: alert.allParksOut,
    parks: alert.venues,
    throughDate: leagueCalendarDate(alert.expiresAt),
  };
}

function throughLabel(alert: OrgAlertRecord | null): string | null {
  if (!alert) return null;
  const clock = alert.expiresAt.toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  });
  return `Through ${clock} CT`;
}

function parkLabel(park: { name: string; shortName: string | null } | null): string {
  return park?.name || park?.shortName || "Park TBD";
}

function fieldLabel(field: { name: string; shortName: string | null } | null): string {
  return field?.name || field?.shortName || "Field TBD";
}

function gameDayFrom(input: {
  org: ContentOrgId;
  postedParkNames: { parkName: string; dateKey: string }[];
  catalogNames: string[];
  alert: OrgAlertRecord | null;
  asOf: Date;
}): GameDayStatus {
  const today = leagueCalendarDate(input.asOf);
  const gamesToday = new Map<string, number>();
  for (const game of input.postedParkNames) {
    if (game.dateKey !== today) continue;
    const name = game.parkName.trim();
    if (!name) continue;
    gamesToday.set(name, (gamesToday.get(name) ?? 0) + 1);
  }
  const names = new Set(input.catalogNames);
  for (const name of gamesToday.keys()) names.add(name);
  const rainout = rainoutFromAlert(input.alert);
  return {
    organizationId: input.org,
    organizationLabel: getOrgDisplayName(input.org),
    parks: [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, gamesToday: gamesToday.get(name) ?? 0 })),
    allParksOut: Boolean(rainout?.allParksOut),
    rainedOutParks: rainout?.allParksOut ? [] : (rainout?.parks ?? []),
    throughLabel: rainout ? throughLabel(input.alert) : null,
  };
}

async function loadOrgPicture(
  org: ContentOrgId,
  outstandingCents: number,
  alert: OrgAlertRecord | null,
  asOf: Date,
): Promise<{ picture: OrgSeasonPicture; gameDay: GameDayStatus }> {
  const season = getSeasonConfigForOrg(org);
  const window = await loadPublicScheduleWindow(org);
  const rainout = rainoutFromAlert(alert);
  const [posted, canceledRows, scores, prior, catalog] = await Promise.all([
    loadPublicScheduleGames({
      org,
      startDate: window.startDate,
      endDate: window.endDate,
    }),
    prisma.scheduleDraftGame.findMany({
      where: {
        organizationId: org,
        status: "CANCELED",
        gameDate: {
          gte: new Date(`${window.startDate}T00:00:00.000Z`),
          lte: new Date(`${window.endDate}T23:59:59.999Z`),
        },
      },
      include: {
        park: { select: { name: true, shortName: true } },
        field: { select: { name: true, shortName: true } },
      },
    }),
    prisma.gameScore.findMany({
      where: { organizationId: org },
      select: { gameExternalId: true, homeScore: true, awayScore: true },
    }),
    prisma.enrollment.aggregate({
      where: { organizationId: org, seasonYear: season.year - 1 },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.schedulePark.findMany({
      where: { organizationId: org, isActive: true },
      select: { name: true },
    }),
  ]);

  const games = [
    ...posted.map((game) => ({
      id: game.id,
      dateKey: game.dateKey,
      startTime: game.startTime,
      ageGroup: game.ageGroup,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      parkName: game.parkName,
      fieldName: game.fieldName,
      canceled: false,
    })),
    ...canceledRows.flatMap((row) => {
      if (!row.gameDate || !row.startTime?.trim() || !row.homeTeamName.trim() || !row.awayTeamName.trim()) {
        return [];
      }
      return [
        {
          id: row.id,
          dateKey: utcDateKey(row.gameDate),
          startTime: row.startTime.trim(),
          ageGroup: row.division || row.ageGroup || "",
          homeTeam: row.homeTeamName,
          awayTeam: row.awayTeamName,
          parkName: parkLabel(row.park),
          fieldName: fieldLabel(row.field),
          canceled: true,
        },
      ];
    }),
  ];

  const picture = buildOrgSeasonPicture({
    organizationId: org,
    organizationLabel: getOrgDisplayName(org),
    seasonLabel: season.label,
    seasonStart: season.startDate,
    games,
    scores,
    activeRainouts: alert ? 1 : 0,
    rainout,
    outstandingCents,
    priorSeasonGrossCents: prior._count._all > 0 ? (prior._sum.amountCents ?? 0) : null,
    priorSeasonYear: prior._count._all > 0 ? season.year - 1 : null,
    asOf,
  });
  return {
    picture,
    gameDay: gameDayFrom({
      org,
      postedParkNames: posted.map((game) => ({ parkName: game.parkName, dateKey: game.dateKey })),
      catalogNames: catalog.map((park) => park.name),
      alert,
      asOf,
    }),
  };
}

export async function loadGameDayStatuses(
  orgs: ContentOrgId[],
  asOf: Date = new Date(),
): Promise<GameDayStatus[]> {
  const alerts = await getAllActiveOrgAlerts();
  const rows = await Promise.all(
    orgs.map(async (org) => {
      const window = await loadPublicScheduleWindow(org);
      const [posted, catalog] = await Promise.all([
        loadPublicScheduleGames({
          org,
          startDate: window.startDate,
          endDate: window.endDate,
        }),
        prisma.schedulePark.findMany({
          where: { organizationId: org, isActive: true },
          select: { name: true },
        }),
      ]);
      return gameDayFrom({
        org,
        postedParkNames: posted.map((game) => ({ parkName: game.parkName, dateKey: game.dateKey })),
        catalogNames: catalog.map((park) => park.name),
        alert: latestAlert(alerts, org),
        asOf,
      });
    }),
  );
  return rows;
}

async function loadSync(org: ContentOrgId): Promise<AssignrSyncView> {
  const job = await prisma.assignrSyncJob.findFirst({
    where: { organizationId: org },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      successCount: true,
      failedCount: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
    },
  });
  if (!job) {
    return {
      organizationId: org,
      status: "NONE",
      atIso: null,
      successCount: 0,
      failedCount: 0,
      errorMessage: null,
    };
  }
  return {
    organizationId: org,
    status: job.status,
    atIso: (job.completedAt ?? job.createdAt).toISOString(),
    successCount: job.successCount,
    failedCount: job.failedCount,
    errorMessage: job.errorMessage,
  };
}

async function loadOperations(org: ContentOrgId): Promise<OperationsView> {
  const season = getSeasonConfigForOrg(org);
  const [conflictGames, nameCollisions, openEquipment] = await Promise.all([
    prisma.scheduleDraftGame.count({
      where: {
        organizationId: org,
        status: "CONFLICT",
        season: { organizationId: org, seasonYear: season.year },
      },
    }),
    countOpenPlayerNameCollisions({ organizationId: org, seasonYear: season.year }),
    prisma.equipmentCheckout.count({
      where: { organizationId: org, status: "open" },
    }),
  ]);
  return { organizationId: org, conflictGames, nameCollisions, openEquipment };
}

async function loadDistrictIncome(asOf: Date): Promise<DistrictIncomeView | null> {
  const seasonYear = seasonYearFromDate(asOf);
  const rows = await prisma.tournamentIncomeTransaction.findMany({
    where: { organizationId: DEFAULT_TOURNAMENT_INCOME_ORG, seasonYear },
    select: {
      category: true,
      classificationStatus: true,
      grossAmountCents: true,
      feeAmountCents: true,
      netAmountCents: true,
    },
  });
  const summary = summarizeTournamentIncome(rows);
  return {
    seasonYear,
    organizationLabel: getBracketOrgDisplayName(DEFAULT_TOURNAMENT_INCOME_ORG),
    grossCents: summary.totals.grossAmountCents,
    netCents: summary.totals.netAmountCents,
    unmatchedCount: summary.byClassification.UNMATCHED.count,
    categories: Object.entries(summary.byCategory)
      .filter(([, bucket]) => bucket.count > 0)
      .map(([category, bucket]) => ({
        label: TOURNAMENT_INCOME_CATEGORY_LABELS[category as keyof typeof TOURNAMENT_INCOME_CATEGORY_LABELS],
        count: bucket.count,
        netCents: bucket.netAmountCents,
      })),
  };
}

export async function loadInSeasonBoard(input: {
  orgs: ContentOrgId[];
  outstandingCentsByOrg: Partial<Record<ContentOrgId, number>>;
  operationsOrgs: ContentOrgId[];
  includeDistrictIncome: boolean;
  asOf?: Date;
}): Promise<InSeasonBoardData> {
  const asOf = input.asOf ?? new Date();
  const alertsPromise = getAllActiveOrgAlerts();
  const syncPromise = Promise.all(input.orgs.map((org) => loadSync(org)));
  const operationsPromise =
    input.operationsOrgs.length > 0
      ? Promise.all(input.operationsOrgs.map((org) => loadOperations(org)))
      : Promise.resolve([]);
  const districtPromise = input.includeDistrictIncome
    ? loadDistrictIncome(asOf).catch((error: unknown) => {
        console.error(
          "In-season district income failed (continuing without the card):",
          error instanceof Error ? error.message : error,
        );
        return null;
      })
    : Promise.resolve(null);
  const alerts = await alertsPromise;
  const loaded = await Promise.all(
    input.orgs.map((org) =>
      loadOrgPicture(
        org,
        input.outstandingCentsByOrg[org] ?? 0,
        latestAlert(alerts, org),
        asOf,
      ),
    ),
  );
  const [sync, operations, district] = await Promise.all([
    syncPromise,
    operationsPromise,
    districtPromise,
  ]);
  return {
    pictures: loaded.map((row) => row.picture),
    gameDays: loaded.map((row) => row.gameDay),
    sync,
    operations,
    district,
  };
}
