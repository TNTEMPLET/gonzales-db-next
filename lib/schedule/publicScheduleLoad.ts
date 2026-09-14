import prisma from "@/lib/prisma";
import { parseRotationNote } from "@/lib/scheduler/practiceBoard";
import { UNALLOCATED_TEAM_NAME_EQUALS } from "@/lib/scheduler/realTeams";
import { parseSeasonDateWindows } from "@/lib/scheduler/seasonWindows";
import { dateKey as utcDateKey } from "@/lib/scheduler/validation";
import type { ContentOrgId } from "@/lib/siteConfig";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";

import {
  collapseSharedPracticeSlots,
  expandRotationPracticeSlots,
  formatPublicClock,
  formatPublicDateLabel,
  isPlacedPublicGame,
  PUBLIC_POSTED_GAME_STATUSES,
  weekdayIndexFromDateKey,
  weekdayName,
  type PublicPracticeSlot,
  type PublicScheduleGame,
} from "./publicSchedule";

export type PublicScheduleWindow = {
  startDate: string;
  endDate: string;
  practiceStartDate: string;
  practiceEndDate: string;
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
      settings: true,
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
  const windows = parseSeasonDateWindows(season?.settings, startsOn, endsOn);
  return {
    startDate: startsOn,
    endDate: endsOn,
    practiceStartDate: windows.practiceStartsOn || startsOn,
    practiceEndDate: windows.practiceEndsOn || endsOn,
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
      status: { in: [...PUBLIC_POSTED_GAME_STATUSES] },
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
  startDate?: string;
  endDate?: string;
}): Promise<PublicPracticeSlot[]> {
  const seasonConfig = getSeasonConfigForOrg(options.org);
  const seasonYear = options.seasonYear ?? seasonConfig.year;
  const seasonWindow = await loadPublicScheduleWindow(options.org);
  const practiceStart = seasonWindow.practiceStartDate;
  const practiceEnd = seasonWindow.practiceEndDate;
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

  const mapped: PublicPracticeSlot[] = slots.map((slot) => {
    const weekdayIndex = slot.dayOfWeek;
    const notes = slot.notes?.trim() || null;
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
      pairTeamName: null,
      sharedFieldGroupId: slot.sharedFieldGroupId ?? null,
      notes,
      rotationWeek: parseRotationNote(notes)?.week || null,
    };
  });
  const dated = expandRotationPracticeSlots(collapseSharedPracticeSlots(mapped), {
    startDate: practiceStart,
    endDate: practiceEnd,
  });
  const viewStart = options.startDate || practiceStart;
  const viewEnd = options.endDate || practiceEnd;
  const datedViewStart = viewStart > practiceStart ? viewStart : practiceStart;
  const datedViewEnd = viewEnd < practiceEnd ? viewEnd : practiceEnd;
  return dated.filter((slot) => {
    if (!slot.dateKey) {
      return viewStart <= practiceEnd && viewEnd >= practiceStart;
    }
    return slot.dateKey >= datedViewStart && slot.dateKey <= datedViewEnd;
  });
}
