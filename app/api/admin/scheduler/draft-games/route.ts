import { NextResponse, type NextRequest } from "next/server";
import type { ScheduleDraftGameStatus } from "@prisma/client";

import prisma from "@/lib/prisma";
import { jsonError, requireSchedulerAdmin, requestId, requireSeason } from "@/lib/scheduler/api";
import { parseDate, parseStringArray, requireString } from "@/lib/scheduler/validation";

const DRAFT_STATUSES = new Set(["DRAFT", "READY", "CONFLICT", "LOCKED", "EXPORTED", "CANCELED"]);
const MANUAL_CONFLICT_FLAGS = new Set(["team_double_booked", "field_time_double_booked"]);


type DraftGamePatch = {
  id?: unknown;
  seasonId?: unknown;
  gameDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  parkId?: unknown;
  fieldId?: unknown;
  division?: unknown;
  ageGroup?: unknown;
  homeTeamId?: unknown;
  awayTeamId?: unknown;
  homeTeamName?: unknown;
  awayTeamName?: unknown;
  status?: unknown;
  roundLabel?: unknown;
  gameNumber?: unknown;
  sortOrder?: unknown;
  conflictFlags?: unknown;
  fairnessScore?: unknown;
  fairnessMetadata?: unknown;
  schedulerNotes?: unknown;
};

type PatchBody = DraftGamePatch | { games?: DraftGamePatch[] };

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseStatus(value: unknown): ScheduleDraftGameStatus | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (!DRAFT_STATUSES.has(normalized)) throw new Error("Invalid draft game status");
  return normalized as ScheduleDraftGameStatus;
}

function optionalInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value;
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function applyDetectedConflicts(game: Awaited<ReturnType<typeof prisma.scheduleDraftGame.update>>) {
  if (!game.gameDate || !game.startTime) return game;

  const overlapping = await prisma.scheduleDraftGame.findMany({
    where: {
      organizationId: game.organizationId,
      seasonId: game.seasonId,
      id: { not: game.id },
      gameDate: game.gameDate,
      startTime: game.startTime,
    },
    select: { fieldId: true, homeTeamId: true, awayTeamId: true },
  });

  const flags = new Set(
    jsonStringArray(game.conflictFlags).filter((flag) => !MANUAL_CONFLICT_FLAGS.has(flag)),
  );
  if (game.fieldId && overlapping.some((other) => other.fieldId === game.fieldId)) {
    flags.add("field_time_double_booked");
  }

  const teamIds = [game.homeTeamId, game.awayTeamId].filter((teamId): teamId is string => Boolean(teamId));
  if (teamIds.length && overlapping.some((other) => [other.homeTeamId, other.awayTeamId].some((teamId) => teamId && teamIds.includes(teamId)))) {
    flags.add("team_double_booked");
  }

  const conflictFlags = [...flags];
  const status = conflictFlags.length ? "CONFLICT" : game.status === "CONFLICT" ? "DRAFT" : game.status;
  if (status === game.status && JSON.stringify(conflictFlags) === JSON.stringify(jsonStringArray(game.conflictFlags))) {
    return game;
  }

  return prisma.scheduleDraftGame.update({
    where: { id: game.id },
    data: { status, conflictFlags },
  });
}

function updateData(game: DraftGamePatch) {
  return {
    ...(game.gameDate !== undefined ? { gameDate: parseDate(game.gameDate, "gameDate") } : {}),
    ...(game.startTime !== undefined ? { startTime: nullableString(game.startTime) } : {}),
    ...(game.endTime !== undefined ? { endTime: nullableString(game.endTime) } : {}),
    ...(game.parkId !== undefined ? { parkId: nullableString(game.parkId) } : {}),
    ...(game.fieldId !== undefined ? { fieldId: nullableString(game.fieldId) } : {}),
    ...(typeof game.division === "string" ? { division: requireString(game.division, "division") } : {}),
    ...(game.ageGroup !== undefined ? { ageGroup: nullableString(game.ageGroup) } : {}),
    ...(game.homeTeamId !== undefined ? { homeTeamId: nullableString(game.homeTeamId) } : {}),
    ...(game.awayTeamId !== undefined ? { awayTeamId: nullableString(game.awayTeamId) } : {}),
    ...(typeof game.homeTeamName === "string" ? { homeTeamName: requireString(game.homeTeamName, "homeTeamName") } : {}),
    ...(typeof game.awayTeamName === "string" ? { awayTeamName: requireString(game.awayTeamName, "awayTeamName") } : {}),
    ...(game.status !== undefined ? { status: parseStatus(game.status) } : {}),
    ...(game.roundLabel !== undefined ? { roundLabel: nullableString(game.roundLabel) } : {}),
    ...(optionalInt(game.gameNumber) !== undefined ? { gameNumber: optionalInt(game.gameNumber) } : {}),
    ...(optionalInt(game.sortOrder) !== undefined ? { sortOrder: optionalInt(game.sortOrder) } : {}),
    ...(game.conflictFlags !== undefined ? { conflictFlags: parseStringArray(game.conflictFlags, "conflictFlags") } : {}),
    ...(typeof game.fairnessScore === "number" ? { fairnessScore: game.fairnessScore } : {}),
    ...(game.fairnessMetadata && typeof game.fairnessMetadata === "object" ? { fairnessMetadata: game.fairnessMetadata } : {}),
    ...(game.schedulerNotes !== undefined ? { schedulerNotes: nullableString(game.schedulerNotes) } : {}),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const seasonId = requestId(request, "seasonId");
    if (!seasonId) return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    await requireSeason(auth.organizationId, seasonId);
    const division = request.nextUrl.searchParams.get("division") || undefined;
    const games = await prisma.scheduleDraftGame.findMany({
      where: { organizationId: auth.organizationId, seasonId, ...(division ? { division } : {}) },
      include: { park: true, field: true, homeTeam: true, awayTeam: true },
      orderBy: [{ gameDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
    });
    return NextResponse.json({ organizationId: auth.organizationId, seasonId, data: games });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as PatchBody;
    const games = "games" in body && Array.isArray(body.games) ? body.games : [body as DraftGamePatch];
    const updated = [];
    for (const game of games) {
      const id = requireString(game.id, "id");
      const existing = await prisma.scheduleDraftGame.findFirst({ where: { id, organizationId: auth.organizationId } });
      if (!existing) return NextResponse.json({ error: `Draft game not found: ${id}` }, { status: 404 });
      if (game.seasonId) await requireSeason(auth.organizationId, requireString(game.seasonId, "seasonId"));
      const saved = await prisma.scheduleDraftGame.update({ where: { id }, data: updateData(game) });
      updated.push(await applyDetectedConflicts(saved));
    }
    return NextResponse.json({ data: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const id = requestId(request, "id");
    if (id) {
      const deleted = await prisma.scheduleDraftGame.deleteMany({ where: { id, organizationId: auth.organizationId } });
      return NextResponse.json({ deleted: deleted.count });
    }

    const seasonId = requestId(request, "seasonId");
    if (!seasonId) return NextResponse.json({ error: "id or seasonId is required" }, { status: 400 });
    await requireSeason(auth.organizationId, seasonId);
    const source = request.nextUrl.searchParams.get("source") || undefined;
    const deleted = await prisma.scheduleDraftGame.deleteMany({
      where: { organizationId: auth.organizationId, seasonId, ...(source ? { source } : {}) },
    });
    return NextResponse.json({ deleted: deleted.count });
  } catch (error) {
    return jsonError(error);
  }
}
