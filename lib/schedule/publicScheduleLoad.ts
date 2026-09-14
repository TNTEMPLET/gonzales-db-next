import prisma from "@/lib/prisma";
import { UNALLOCATED_TEAM_NAME_EQUALS } from "@/lib/scheduler/realTeams";
import { dateKey as utcDateKey } from "@/lib/scheduler/validation";
import type { ContentOrgId } from "@/lib/siteConfig";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";

import {
  formatPublicClock,
  formatPublicDateLabel,
  isPlacedPublicGame,
  weekdayIndexFromDateKey,
  weekdayName,
  type PublicPracticeSlot,
  type PublicScheduleGame,
} from "./publicSchedule";

export type PublicScheduleWindow = {
  startDate: string;
  endDate: string;
  seasonName: string;
  seasonYear: number;
};

async function resolveSeason(organizationId: string, seasonYear: number) {
  const seasons = await prisma.scheduleSeason.findMany({
    where: { organizationId, seasonYear },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      startsOn: true,
      endsOn: true,
    },
  });
  if (seasons.length === 0) return null;
  return (
    seasons.find((season) => season.status === "ACTIVE") ||
    seasons.find((season) => season.status === "LOCKED") ||
    seasons.find((season) => season.status === "DRAFT") ||
    seasons[0]
  );
}

export async function loadPublicScheduleWindow(
  org: ContentOrgId,
): Promise<PublicScheduleWindow> {
  const config = getSeasonConfigForOrg(org);
  const season = await resolveSeason(org, config.year);
  const startsOn = season?.startsOn ? utcDateKey(season.startsOn) : config.startDate;
  const endsOn = season?.endsOn ? utcDateKey(season.endsOn) : config.endDate;
  return {
    startDate: startsOn,
    endDate: endsOn,
    seasonName: season?.name || config.label,
    seasonYear: config.year,
  };
}

function dateRangeFilter(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return undefined;
  return {
    gte: startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined,
    lte: endDate ? new Date(`${endDate}T23:59:59.999Z`) : undefined,
  };
}

export async function loadPublicScheduleGames(options: {
  org: ContentOrgId;
  startDate?: string;
  endDate?: string;
}): Promise<PublicScheduleGame[]> {
  const config = getSeasonConfigForOrg(options.org);
  const season = await resolveSeason(options.org, config.year);
  if (!season) return [];

  const rows = await prisma.scheduleDraftGame.findMany({
    where: {
      organizationId: options.org,
      seasonId: season.id,
      status: { not: "CANCELED" },
      gameDate: dateRangeFilter(options.startDate, options.endDate),
    },
    include: {
      park: { select: { name: true, shortName: true } },
      field: { select: { name: true, shortName: true } },
    },
    orderBy: [{ gameDate: "asc" }, { startTime: "asc" }],
  });

  return rows
    .filter((row) =>
      isPlacedPublicGame({
        gameDate: row.gameDate,
        startTime: row.startTime,
        homeTeamName: row.homeTeamName,
        awayTeamName: row.awayTeamName,
        status: row.status,
      }),
    )
    .map((row) => {
      const dateKey = utcDateKey(row.gameDate as Date);
      const weekdayIndex = weekdayIndexFromDateKey(dateKey);
      const startTime = row.startTime!.trim();
      return {
        id: row.id,
        dateKey,
        weekdayIndex,
        weekdayName: weekdayName(weekdayIndex),
        dateLabel: formatPublicDateLabel(dateKey),
        timeLabel: formatPublicClock(startTime),
        startTime,
        ageGroup: row.division || row.ageGroup || "",
        homeTeam: row.homeTeamName,
        awayTeam: row.awayTeamName,
        parkName: row.park?.name || row.park?.shortName || "Park TBD",
        fieldName: row.field?.name || row.field?.shortName || "Field TBD",
        status: "A" as const,
        homeTeamId: row.homeTeamId,
        awayTeamId: row.awayTeamId,
      };
    });
}

export async function loadPublicPracticeSlots(options: {
  org: ContentOrgId;
  seasonYear?: number;
}): Promise<PublicPracticeSlot[]> {
  const seasonYear = options.seasonYear ?? getSeasonConfigForOrg(options.org).year;
  const slots = await prisma.teamPracticeSlot.findMany({
    where: {
      organizationId: options.org,
      seasonYear,
      team: { NOT: { teamName: UNALLOCATED_TEAM_NAME_EQUALS } },
    },
    include: {
      team: { select: { id: true, teamName: true, ageGroup: true } },
      park: { select: { name: true, shortName: true } },
      field: { select: { name: true, shortName: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  const groupIds = Array.from(
    new Set(slots.map((slot) => slot.sharedFieldGroupId).filter((id): id is string => Boolean(id))),
  );
  const siblings =
    groupIds.length === 0
      ? []
      : await prisma.teamPracticeSlot.findMany({
          where: { sharedFieldGroupId: { in: groupIds } },
          include: { team: { select: { id: true, teamName: true } } },
        });
  const pairBySlotId = new Map<string, string>();
  for (const slot of slots) {
    if (!slot.sharedFieldGroupId) continue;
    const partner = siblings.find(
      (row) =>
        row.sharedFieldGroupId === slot.sharedFieldGroupId &&
        row.teamId !== slot.teamId,
    );
    if (partner?.team.teamName) pairBySlotId.set(slot.id, partner.team.teamName);
  }

  return slots.map((slot) => {
    const weekdayIndex = slot.dayOfWeek;
    return {
      id: slot.id,
      weekdayIndex,
      weekdayName: weekdayName(weekdayIndex),
      timeLabel: formatPublicClock(slot.startTime),
      startTime: slot.startTime,
      ageGroup: slot.ageGroup || slot.team.ageGroup,
      teamName: slot.team.teamName,
      teamId: slot.team.id,
      parkName: slot.park?.name || slot.park?.shortName || "Park TBD",
      fieldName: slot.field?.name || slot.field?.shortName || "Field TBD",
      pairTeamName: pairBySlotId.get(slot.id) ?? null,
    };
  });
}
