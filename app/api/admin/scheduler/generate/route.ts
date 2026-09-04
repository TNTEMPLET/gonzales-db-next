import { NextResponse, type NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { jsonError, loadGenerationContext, requestId, requireSchedulerAdmin, requireSeason } from "@/lib/scheduler/api";
import { buildSchedulerSlots, generateSchedule, repairUnplacedGames, summarizeFairness } from "@/lib/scheduler/generator";
import { UNALLOCATED_TEAM_NAME_EQUALS } from "@/lib/scheduler/realTeams";
import type { GeneratedDraftGame } from "@/lib/scheduler/types";
import { jsonStringArray, parseStringArray, requireString } from "@/lib/scheduler/validation";

type GeneratePayload = {
  seasonId?: unknown;
  divisions?: unknown;
  replace?: unknown;
  confirmReplace?: unknown;
  allowConflicts?: unknown;
  repair?: unknown;
};

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
        NOT: { teamName: UNALLOCATED_TEAM_NAME_EQUALS },
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
    const repair = body.repair === true;

    if (repair) {
      const context = await loadGenerationContext({ organizationId: auth.organizationId, seasonId, divisions });
      const existing = await prisma.scheduleDraftGame.findMany({
        where: {
          organizationId: auth.organizationId,
          seasonId,
          ...(divisions.length ? { division: { in: divisions } } : {}),
          NOT: { status: "CANCELED" },
        },
        orderBy: [{ gameNumber: "asc" }, { sortOrder: "asc" }],
      });
      const slots = buildSchedulerSlots({
        season: context.season,
        fields: context.fields,
        availabilities: context.availabilities,
      });
      const games: GeneratedDraftGame[] = existing.map((row) => ({
        division: row.division,
        ageGroup: row.ageGroup || row.division,
        homeTeamId: row.homeTeamId || "",
        awayTeamId: row.awayTeamId || "",
        homeTeamName: row.homeTeamName,
        awayTeamName: row.awayTeamName,
        roundLabel: row.roundLabel || "",
        gameNumber: row.gameNumber ?? row.sortOrder ?? 0,
        gameDate: row.gameDate,
        startTime: row.startTime,
        endTime: row.endTime,
        parkId: row.parkId,
        fieldId: row.fieldId,
        status: row.status === "CONFLICT" || !row.gameDate ? "CONFLICT" : "DRAFT",
        sortOrder: row.sortOrder ?? row.gameNumber ?? 0,
        conflictFlags: jsonStringArray(row.conflictFlags),
        fairnessMetadata:
          row.fairnessMetadata && typeof row.fairnessMetadata === "object" && !Array.isArray(row.fairnessMetadata)
            ? (row.fairnessMetadata as GeneratedDraftGame["fairnessMetadata"])
            : {},
        schedulerNotes: row.schedulerNotes,
      }));
      const lockedIds = existing
        .filter((row) => row.status === "LOCKED" || row.status === "EXPORTED")
        .map((row) => `${row.division}:${row.gameNumber ?? row.sortOrder ?? 0}`);
      const repaired = repairUnplacedGames({ games, slots, rules: context.rules, lockedIds });
      const updates = existing.flatMap((row) => {
        if (row.status === "LOCKED" || row.status === "EXPORTED") return [];
        const next = repaired.games.find((game) => game.division === row.division && game.gameNumber === row.gameNumber);
        if (!next) return [];
        return [
          prisma.scheduleDraftGame.update({
            where: { id: row.id },
            data: {
              gameDate: next.gameDate,
              startTime: next.startTime,
              endTime: next.endTime,
              parkId: next.parkId,
              fieldId: next.fieldId,
              status: next.status,
              conflictFlags: next.conflictFlags,
              fairnessMetadata: next.fairnessMetadata,
              schedulerNotes: next.schedulerNotes,
            },
          }),
        ];
      });
      if (updates.length) await prisma.$transaction(updates);
      const saved = await prisma.scheduleDraftGame.findMany({
        where: {
          organizationId: auth.organizationId,
          seasonId,
          ...(divisions.length ? { division: { in: divisions } } : {}),
        },
        include: { park: true, field: true, homeTeam: true, awayTeam: true },
        orderBy: [{ gameDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
      });
      return NextResponse.json({
        mode: "repair",
        data: {
          requestedDivisions: divisions,
          slots,
          games: repaired.games,
          fairness: summarizeFairness(repaired.games, context.teams),
          repair: repaired.summary,
          errors: [],
          savedGames: saved,
        },
      });
    }

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
