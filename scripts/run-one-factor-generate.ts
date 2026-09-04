/**
 * 1-factor generate against the cloned Fall Ball season (dev DB only).
 *
 *   pnpm exec tsx --env-file=.env.development.local scripts/run-one-factor-generate.ts
 */
import { PrismaClient } from "@prisma/client";

import { createDatabaseAdapter } from "../lib/databaseAdapter";
import { generateSchedule } from "../lib/scheduler/generator";
import { UNALLOCATED_TEAM_NAME_EQUALS } from "../lib/scheduler/realTeams";

const ORGANIZATION_ID = "fallball";
const DIVISIONS = ["7U CP", "8U CP", "9U"];
const GAMES_PER_TEAM = 10;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (use --env-file=.env.development.local)");
  }
  if (/db\.prisma\.io|prisma-data\.net/i.test(process.env.DATABASE_URL)) {
    throw new Error("Refusing to run against production DATABASE_URL");
  }

  const prisma = new PrismaClient({ adapter: createDatabaseAdapter(process.env.DATABASE_URL) });
  try {
    const season = await prisma.scheduleSeason.findFirst({
      where: { organizationId: ORGANIZATION_ID },
      orderBy: { seasonYear: "desc" },
    });
    if (!season) throw new Error("No Fall Ball schedule season on the clone");

    const rules = await prisma.scheduleDivisionRule.findMany({
      where: { organizationId: ORGANIZATION_ID, seasonId: season.id, division: { in: DIVISIONS } },
    });
    const ageGroups = [...new Set(rules.map((rule) => rule.ageGroup || rule.division))];
    const [teams, fields, availabilities] = await Promise.all([
      prisma.team.findMany({
        where: {
          organizationId: ORGANIZATION_ID,
          seasonYear: season.seasonYear,
          ageGroup: { in: ageGroups },
          NOT: { teamName: UNALLOCATED_TEAM_NAME_EQUALS },
        },
        orderBy: [{ ageGroup: "asc" }, { teamName: "asc" }],
      }),
      prisma.scheduleField.findMany({
        where: { organizationId: ORGANIZATION_ID, isActive: true },
        include: { park: true },
      }),
      prisma.scheduleFieldAvailability.findMany({
        where: { organizationId: ORGANIZATION_ID, OR: [{ seasonId: season.id }, { seasonId: null }] },
      }),
    ]);
    const context = { season, rules, teams, fields, availabilities };
    const result = generateSchedule({
      organizationId: ORGANIZATION_ID,
      season: context.season,
      teams: context.teams,
      fields: context.fields,
      availabilities: context.availabilities,
      rules: context.rules,
      divisions: DIVISIONS,
      gamesPerTeam: GAMES_PER_TEAM,
    });

    const placed = result.games.filter((game) => game.gameDate && game.fieldId).length;
    console.log(
      JSON.stringify(
        {
          seasonId: season.id,
          errors: result.errors,
          repair: result.repair,
          totals: { games: result.games.length, placed, unplaced: result.games.length - placed },
          byDivision: DIVISIONS.map((division) => {
            const games = result.games.filter((game) => game.division === division);
            return {
              division,
              games: games.length,
              placed: games.filter((game) => game.gameDate && game.fieldId).length,
            };
          }),
        },
        null,
        2,
      ),
    );

    if (result.errors.length) {
      throw new Error(result.errors.map((error) => error.message).join("; "));
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleDraftGame.deleteMany({
        where: {
          organizationId: ORGANIZATION_ID,
          seasonId: season.id,
          division: { in: DIVISIONS },
        },
      });
      if (result.games.length) {
        await tx.scheduleDraftGame.createMany({
          data: result.games.map((game) => ({
            organizationId: ORGANIZATION_ID,
            seasonId: season.id,
            gameDate: game.gameDate,
            startTime: game.startTime,
            endTime: game.endTime,
            parkId: game.parkId,
            fieldId: game.fieldId,
            division: game.division,
            ageGroup: game.ageGroup,
            homeTeamId: game.homeTeamId,
            awayTeamId: game.awayTeamId,
            homeTeamName: game.homeTeamName,
            awayTeamName: game.awayTeamName,
            status: game.status,
            source: "generated",
            roundLabel: game.roundLabel,
            gameNumber: game.gameNumber,
            sortOrder: game.sortOrder,
            conflictFlags: game.conflictFlags,
            fairnessScore: null,
            fairnessMetadata: game.fairnessMetadata,
            schedulerNotes: game.schedulerNotes,
          })),
        });
      }
    });
    console.log("Wrote 1-factor draft to clone (7U CP, 8U CP, 9U).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
