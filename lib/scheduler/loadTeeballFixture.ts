import type { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import {
  TEEBALL_DIVISIONS,
  TEEBALL_DURATION_MINUTES,
  TEEBALL_FIXTURE_ORG,
  TEEBALL_FIXTURE_YEAR,
  TEEBALL_GAMES,
  TEEBALL_PRACTICE,
  TEEBALL_START_TIME,
} from "@/lib/scheduler/fixtures/fallball-2026-teeball";
import { replaceDivisionPracticeSlots } from "@/lib/scheduler/practiceSlotWrite";
import { addMinutes } from "@/lib/scheduler/validation";
import { SchedulerError } from "@/lib/scheduler/types";
import { fieldNumberFromName, findTeamByMascot, isPaulaParkName } from "@/lib/scheduler/teeballMascot";
import { UNALLOCATED_TEAM_NAME_EQUALS } from "@/lib/scheduler/realTeams";
import { parseUtcDateOnly } from "@/lib/scheduler/seasonWindows";
import type { PracticeAssignment } from "@/lib/scheduler/practiceBoard";

const DAYS = { MW: [1, 3], TTh: [2, 4] } as const;

export function canLoadTeeballFixture(organizationId: string, seasonYear: number): boolean {
  return organizationId === TEEBALL_FIXTURE_ORG && seasonYear === TEEBALL_FIXTURE_YEAR;
}

export async function loadFallball2026Teeball(params: {
  organizationId: string;
  seasonId: string;
  seasonYear: number;
}): Promise<{ practiceCreated: number; gamesCreated: number; divisions: string[] }> {
  if (!canLoadTeeballFixture(params.organizationId, params.seasonYear)) {
    throw new SchedulerError("Tee-ball Fall 2026 sheets are only for Fall Ball 2026", "INVALID_INPUT", {
      organizationId: params.organizationId,
      seasonYear: params.seasonYear,
    });
  }

  const [teams, fields] = await Promise.all([
    prisma.team.findMany({
      where: {
        organizationId: params.organizationId,
        seasonYear: params.seasonYear,
        ageGroup: { in: [...TEEBALL_DIVISIONS] },
        NOT: { teamName: UNALLOCATED_TEAM_NAME_EQUALS },
      },
    }),
    prisma.scheduleField.findMany({
      where: { organizationId: params.organizationId, isActive: true },
      include: { park: true },
    }),
  ]);

  const paulaFields = fields.filter((field) => isPaulaParkName(field.park?.name));
  if (!paulaFields.length) {
    throw new SchedulerError("Paula Park was not found for Tee-ball fields 1–6", "INVALID_INPUT");
  }
  const fieldByNumber = new Map<number, (typeof fields)[number]>();
  for (const field of paulaFields) {
    const number = fieldNumberFromName(field.name);
    if (number != null && !fieldByNumber.has(number)) fieldByNumber.set(number, field);
  }

  let practiceCreated = 0;
  for (const ageGroup of TEEBALL_DIVISIONS) {
    const divisionTeams = teams.filter((team) => team.ageGroup === ageGroup);
    const assignments: PracticeAssignment[] = [];
    for (const row of TEEBALL_PRACTICE.filter((item) => item.ageGroup === ageGroup)) {
      const field = fieldByNumber.get(row.fieldNumber);
      if (!field) {
        throw new SchedulerError(`Paula Park field ${row.fieldNumber} was not found`, "INVALID_INPUT", { fieldNumber: row.fieldNumber });
      }
      const first = findTeamByMascot(divisionTeams, row.mascots[0]);
      const second = findTeamByMascot(divisionTeams, row.mascots[1]);
      if (!first || !second) {
        throw new SchedulerError(
          `Could not match ${ageGroup} ${row.mascots[0]} / ${row.mascots[1]} to a roster team`,
          "MISSING_TEAMS",
          { ageGroup, mascots: row.mascots },
        );
      }
      for (const dayOfWeek of DAYS[row.days]) {
        assignments.push({
          teamId: first.id,
          dayOfWeek,
          startTime: TEEBALL_START_TIME,
          durationMinutes: TEEBALL_DURATION_MINUTES,
          parkId: field.parkId,
          fieldId: field.id,
          pairWithTeamId: second.id,
          notes: null,
        });
      }
    }
    const written = await replaceDivisionPracticeSlots({
      organizationId: params.organizationId,
      seasonYear: params.seasonYear,
      ageGroup,
      assignments,
    });
    practiceCreated += written.created;
  }

  const gameRows = TEEBALL_GAMES.map((row, index) => {
    const field = fieldByNumber.get(row.fieldNumber);
    const divisionTeams = teams.filter((team) => team.ageGroup === row.ageGroup);
    const home = findTeamByMascot(divisionTeams, row.home);
    const away = findTeamByMascot(divisionTeams, row.away);
    const gameDate = parseUtcDateOnly(row.date);
    if (!field || !home || !away || !gameDate) {
      throw new SchedulerError(
        `Could not resolve Tee-ball game ${row.date} ${row.home} vs ${row.away} on field ${row.fieldNumber}`,
        "INVALID_INPUT",
        { row },
      );
    }
    return {
      organizationId: params.organizationId,
      seasonId: params.seasonId,
      gameDate,
      startTime: TEEBALL_START_TIME,
      endTime: addMinutes(TEEBALL_START_TIME, TEEBALL_DURATION_MINUTES),
      parkId: field.parkId,
      fieldId: field.id,
      division: row.ageGroup,
      ageGroup: row.ageGroup,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeTeamName: home.teamName,
      awayTeamName: away.teamName,
      status: "DRAFT" as const,
      source: "generated",
      roundLabel: row.roundLabel,
      gameNumber: index + 1,
      sortOrder: index + 1,
      conflictFlags: [] as Prisma.InputJsonValue,
      fairnessMetadata: { packer: "teeballFixture2026" } as Prisma.InputJsonValue,
      schedulerNotes: null,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.scheduleDraftGame.deleteMany({
      where: {
        organizationId: params.organizationId,
        seasonId: params.seasonId,
        division: { in: [...TEEBALL_DIVISIONS] },
        source: "generated",
        NOT: { status: { in: ["LOCKED", "EXPORTED"] } },
      },
    });
    if (gameRows.length) await tx.scheduleDraftGame.createMany({ data: gameRows });
  });

  return {
    practiceCreated,
    gamesCreated: gameRows.length,
    divisions: [...TEEBALL_DIVISIONS],
  };
}
