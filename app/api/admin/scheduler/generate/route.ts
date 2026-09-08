import { NextResponse, type NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { jsonError, loadGenerationContext, requestId, requireSchedulerAdmin, requireSeason } from "@/lib/scheduler/api";
import { buildSchedulerSlots, generateSchedule, repairUnplacedGames, summarizeFairness } from "@/lib/scheduler/generator";
import { generateGamesFromPracticeNights, type PracticeNightSlot } from "@/lib/scheduler/practiceNightGames";
import { canLoadTeeballFixture, loadFallball2026Teeball } from "@/lib/scheduler/loadTeeballFixture";
import { parseScheduleMode, type ScheduleMode } from "@/lib/scheduler/scheduleMode";
import { generateThreeTeamDoubleheaders } from "@/lib/scheduler/threeTeamDoubleheaders";
import { UNALLOCATED_TEAM_NAME_EQUALS } from "@/lib/scheduler/realTeams";
import type { GeneratedDraftGame, SchedulerGenerationResult } from "@/lib/scheduler/types";
import { jsonStringArray, parseStringArray, requireString } from "@/lib/scheduler/validation";

type GeneratePayload = {
  seasonId?: unknown;
  divisions?: unknown;
  replace?: unknown;
  confirmReplace?: unknown;
  allowConflicts?: unknown;
  repair?: unknown;
  packer?: unknown;
};

function parsePacker(value: unknown): "oneFactor" | "doubleheaders" | "practiceGames" | "teeballFixture" {
  if (value === "doubleheaders" || value === "practiceGames" || value === "teeballFixture") return value;
  return "oneFactor";
}

function requiredMode(packer: ReturnType<typeof parsePacker>): ScheduleMode | null {
  if (packer === "doubleheaders") return "manual";
  if (packer === "practiceGames") return "practiceGames";
  if (packer === "teeballFixture") return null;
  return "auto";
}

async function loadPracticeNightSlots(params: {
  organizationId: string;
  seasonYear: number;
  divisions: string[];
}): Promise<PracticeNightSlot[]> {
  const slots = await prisma.teamPracticeSlot.findMany({
    where: {
      organizationId: params.organizationId,
      seasonYear: params.seasonYear,
      ageGroup: { in: params.divisions },
    },
    include: { team: { select: { id: true, teamName: true, ageGroup: true, organizationId: true, seasonYear: true } } },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return slots.map((slot) => ({
    ageGroup: slot.ageGroup,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    parkId: slot.parkId,
    fieldId: slot.fieldId,
    team: {
      id: slot.team.id,
      organizationId: slot.team.organizationId,
      seasonYear: slot.team.seasonYear,
      ageGroup: slot.team.ageGroup,
      teamName: slot.team.teamName,
    },
  }));
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
    const packer = parsePacker(body.packer);

    if (!repair && packer !== "teeballFixture" && !divisions.length) {
      return NextResponse.json(
        { error: "divisions is required so Generate cannot wipe other divisions", code: "INVALID_INPUT" },
        { status: 400 },
      );
    }

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

    if (packer === "teeballFixture") {
      const season = await requireSeason(auth.organizationId, seasonId);
      if (!canLoadTeeballFixture(auth.organizationId, season.seasonYear)) {
        return NextResponse.json(
          { error: "Tee-ball Fall 2026 sheets are only available for Fall Ball 2026", code: "INVALID_INPUT" },
          { status: 400 },
        );
      }
      const loaded = await loadFallball2026Teeball({
        organizationId: auth.organizationId,
        seasonId: season.id,
        seasonYear: season.seasonYear,
      });
      return NextResponse.json({
        mode: "replace",
        data: {
          requestedDivisions: loaded.divisions,
          slots: [],
          games: [],
          fairness: { teams: [], unscheduledGames: [] },
          errors: [],
          loaded,
        },
      });
    }

    const context = await loadGenerationContext({ organizationId: auth.organizationId, seasonId, divisions });
    const mode = requiredMode(packer);
    const scopedDivisions = divisions.filter((division) => {
      const rule = context.rules.find((entry) => entry.division === division);
      return mode === null || parseScheduleMode(rule?.ruleMetadata, division) === mode;
    });
    if (!scopedDivisions.length) {
      return NextResponse.json(
        {
          error:
            packer === "oneFactor"
              ? "Pick at least one Auto division. Manual and Practice-as-games are not 1-factor."
              : packer === "doubleheaders"
                ? "Pick at least one Manual / DH division."
                : "Pick at least one Practice-as-games division.",
          code: "INVALID_INPUT",
        },
        { status: 400 },
      );
    }

    let result: SchedulerGenerationResult;
    if (packer === "doubleheaders") {
      result = generateThreeTeamDoubleheaders({
        organizationId: auth.organizationId,
        season: context.season,
        teams: context.teams,
        fields: context.fields,
        availabilities: context.availabilities,
        rules: context.rules,
        divisions: scopedDivisions,
      });
    } else if (packer === "practiceGames") {
      const nightSlots = await loadPracticeNightSlots({
        organizationId: auth.organizationId,
        seasonYear: context.season.seasonYear,
        divisions: scopedDivisions,
      });
      result = generateGamesFromPracticeNights({
        organizationId: auth.organizationId,
        season: context.season,
        teams: context.teams,
        fields: context.fields,
        rules: context.rules,
        slots: nightSlots,
        divisions: scopedDivisions,
      });
    } else {
      result = generateSchedule({
        organizationId: auth.organizationId,
        season: context.season,
        teams: context.teams,
        fields: context.fields,
        availabilities: context.availabilities,
        rules: context.rules,
        divisions: scopedDivisions,
      });
    }

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
          division: { in: scopedDivisions },
          NOT: { status: { in: ["LOCKED", "EXPORTED"] } },
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
        division: { in: scopedDivisions },
      },
      include: { park: true, field: true, homeTeam: true, awayTeam: true },
      orderBy: [{ gameDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
    });

    return NextResponse.json({ mode: "replace", data: { ...result, savedGames: saved } });
  } catch (error) {
    return jsonError(error);
  }
}
