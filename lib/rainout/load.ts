import prisma from "@/lib/prisma";
import { loadPublicScheduleGames, loadPublicScheduleWindow } from "@/lib/schedule/publicScheduleLoad";
import { UNALLOCATED_TEAM_NAME_EQUALS } from "@/lib/scheduler/realTeams";
import { leagueCalendarDate, getSeasonConfigForOrg } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

import { displayParkName } from "./parks";
import type { RainoutGameInput, RainoutPlayerInput, RainoutTeamRef } from "./recipients";

export async function loadKnownParkNames(organizationId: ContentOrgId, asOf: Date = new Date()): Promise<string[]> {
  const today = leagueCalendarDate(asOf);
  const [parks, window] = await Promise.all([
    prisma.schedulePark.findMany({
      where: { organizationId, isActive: true },
      select: { name: true },
    }),
    loadPublicScheduleWindow(organizationId),
  ]);
  const names = new Set(parks.map((park) => park.name.trim()).filter(Boolean));
  const games = await loadPublicScheduleGames({
    org: organizationId,
    startDate: window.startDate,
    endDate: window.endDate,
  });
  for (const game of games) {
    if (game.dateKey === today && game.parkName.trim()) names.add(game.parkName.trim());
  }
  return [...names];
}

function personName(row: { fullName: string; firstName: string | null; lastName: string | null }): string {
  const combined = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return combined || row.fullName.trim();
}

function normName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function loadRainoutAudience(
  organizationId: ContentOrgId,
  calendarDate: string,
): Promise<{
  games: RainoutGameInput[];
  teams: RainoutTeamRef[];
  players: RainoutPlayerInput[];
}> {
  const posted = await loadPublicScheduleGames({
    org: organizationId,
    startDate: calendarDate,
    endDate: calendarDate,
  });
  const games: RainoutGameInput[] = posted
    .filter((game) => game.dateKey === calendarDate)
    .map((game) => ({
      id: game.id,
      parkName: displayParkName(game.parkName),
      startTime: game.startTime.trim(),
      division: game.ageGroup,
      ageGroup: game.ageGroup,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeTeamName: game.homeTeam,
      awayTeamName: game.awayTeam,
    }));

  const linkedTeamIds = new Set<string>();
  for (const game of games) {
    if (game.homeTeamId) linkedTeamIds.add(game.homeTeamId);
    if (game.awayTeamId) linkedTeamIds.add(game.awayTeamId);
  }

  const seasonYear = getSeasonConfigForOrg(organizationId).year;
  const teamRows = await prisma.team.findMany({
    where: {
      organizationId,
      NOT: { teamName: UNALLOCATED_TEAM_NAME_EQUALS },
      OR: [{ seasonYear }, ...(linkedTeamIds.size ? [{ id: { in: [...linkedTeamIds] } }] : [])],
    },
    select: {
      id: true,
      teamName: true,
      ageGroup: true,
      players: {
        select: { fullName: true, firstName: true, lastName: true, guardianEmail: true },
      },
      enrollments: {
        select: { fullName: true, firstName: true, lastName: true, guardianEmail: true },
      },
    },
  });

  const teams: RainoutTeamRef[] = teamRows.map((team) => ({
    id: team.id,
    teamName: team.teamName,
    ageGroup: team.ageGroup,
  }));

  const players: RainoutPlayerInput[] = [];
  for (const team of teamRows) {
    const byName = new Map<string, RainoutPlayerInput>();
    for (const player of team.players) {
      const fullName = personName(player);
      if (!fullName) continue;
      byName.set(normName(fullName), {
        teamId: team.id,
        fullName,
        guardianEmail: player.guardianEmail,
      });
    }
    for (const enrollment of team.enrollments) {
      const fullName = personName(enrollment);
      if (!fullName) continue;
      const key = normName(fullName);
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { teamId: team.id, fullName, guardianEmail: enrollment.guardianEmail });
      } else if (!existing.guardianEmail?.trim() && enrollment.guardianEmail?.trim()) {
        existing.guardianEmail = enrollment.guardianEmail;
      }
    }
    players.push(...byName.values());
  }

  return { games, teams, players };
}

export async function loadNotifiedParkKeys(organizationId: string, calendarDate: string): Promise<string[]> {
  const rows = await prisma.rainoutParkNotification.findMany({
    where: { organizationId, calendarDate },
    select: { parkKey: true },
  });
  return rows.map((row) => row.parkKey);
}

export async function loadSuppressedEmails(organizationId: string): Promise<Set<string>> {
  const rows = await prisma.emailSuppression.findMany({
    where: { OR: [{ organizationId }, { organizationId: null }] },
    select: { email: true },
  });
  return new Set(rows.map((row) => row.email.trim().toLowerCase()).filter(Boolean));
}
