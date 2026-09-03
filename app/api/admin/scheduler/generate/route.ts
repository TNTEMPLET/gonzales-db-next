import { NextResponse, type NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { jsonError, loadGenerationContext, requestId, requireSchedulerAdmin, requireSeason } from "@/lib/scheduler/api";
import { generateSchedule } from "@/lib/scheduler/generator";
import { SchedulerError } from "@/lib/scheduler/types";
import { parseStringArray, requireString } from "@/lib/scheduler/validation";

type GeneratePayload = {
  seasonId?: unknown;
  divisions?: unknown;
  replace?: unknown;
  confirmReplace?: unknown;
  allowConflicts?: unknown;
  gamesPerTeam?: unknown;
};

const MAX_GAMES_PER_TEAM = 30;

function parseGamesPerTeam(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new SchedulerError("gamesPerTeam must be a whole number", "INVALID_INPUT", { field: "gamesPerTeam" });
  }
  if (value < 1 || value > MAX_GAMES_PER_TEAM) {
    throw new SchedulerError(`gamesPerTeam must be between 1 and ${MAX_GAMES_PER_TEAM}`, "INVALID_INPUT", { field: "gamesPerTeam", max: MAX_GAMES_PER_TEAM });
  }
  return value;
}

function parseSeasonYearParam(value: string | null): number | null {
  if (!value?.trim()) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
  return year;
}

export async function GET(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const seasonId = requestId(request, "seasonId");
    const seasonYear = seasonId
      ? (await requireSeason(auth.organizationId, seasonId)).seasonYear
      : parseSeasonYearParam(request.nextUrl.searchParams.get("seasonYear"));
    if (!seasonYear) {
      return NextResponse.json({ error: "seasonId or seasonYear is required" }, { status: 400 });
    }
    const teams = await prisma.team.groupBy({
      by: ["ageGroup"],
      where: {
        organizationId: auth.organizationId,
        seasonYear,
        NOT: { teamName: { equals: "Unallocated", mode: "insensitive" } },
      },
      _count: { _all: true },
    });
    const teamCounts: Record<string, number> = {};
    for (const row of teams) {
      if (row.ageGroup) teamCounts[row.ageGroup] = row._count._all;
    }
    return NextResponse.json({ data: { teamCounts, seasonYear } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as GeneratePayload;
    const seasonId = requireString(body.seasonId, "seasonId");
    const divisions = parseStringArray(body.divisions, "divisions");
    const replace = body.replace === true;
    const confirmReplace = body.confirmReplace === true;
    const allowConflicts = body.allowConflicts === true;
    const gamesPerTeam = parseGamesPerTeam(body.gamesPerTeam);

    if (replace && !confirmReplace) {
      return NextResponse.json(
        { error: "confirmReplace=true is required when replace=true", code: "INVALID_INPUT" },
        { status: 400 },
      );
    }

    const context = await loadGenerationContext({ organizationId: auth.organizationId, seasonId, divisions });
    const result = generateSchedule({
      organizationId: auth.organizationId,
      season: context.season,
      teams: context.teams,
      fields: context.fields,
      availabilities: context.availabilities,
      rules: context.rules,
      divisions,
      gamesPerTeam,
    });

    if (!replace) {
      return NextResponse.json({ mode: "preview", data: result }, { status: result.errors.length ? 422 : 200 });
    }

    if (result.errors.length && !allowConflicts) {
      return NextResponse.json(
        {
          error: "Generated schedule has errors; pass allowConflicts=true to save conflict drafts",
          code: "CONFLICT",
          data: result,
        },
        { status: 422 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleDraftGame.deleteMany({
        where: {
          organizationId: auth.organizationId,
          seasonId,
          source: "generated",
          ...(divisions.length ? { division: { in: divisions } } : {}),
        },
      });
      if (result.games.length) {
        await tx.scheduleDraftGame.createMany({
          data: result.games.map((game) => ({
            organizationId: auth.organizationId,
            seasonId,
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

    const saved = await prisma.scheduleDraftGame.findMany({
      where: {
        organizationId: auth.organizationId,
        seasonId,
        source: "generated",
        ...(divisions.length ? { division: { in: divisions } } : {}),
      },
      include: { park: true, field: true, homeTeam: true, awayTeam: true },
      orderBy: [{ gameDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
    });

    return NextResponse.json({ mode: "replace", data: { ...result, savedGames: saved } });
  } catch (error) {
    return jsonError(error);
  }
}
