import { NextResponse, type NextRequest } from "next/server";
import type { ScheduleSeasonStatus } from "@prisma/client";

import prisma from "@/lib/prisma";
import { jsonError, requireSchedulerAdmin } from "@/lib/scheduler/api";
import { parseDate, parseStringArray, requireString } from "@/lib/scheduler/validation";

const SEASON_STATUSES = new Set(["DRAFT", "ACTIVE", "LOCKED", "ARCHIVED"]);

type SeasonPayload = {
  id?: unknown;
  seasonYear?: unknown;
  name?: unknown;
  status?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  defaultGameTimes?: unknown;
  settings?: unknown;
};

function parseSeasonStatus(value: unknown): ScheduleSeasonStatus | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const status = value.trim().toUpperCase();
  if (!SEASON_STATUSES.has(status)) throw new Error("Invalid schedule season status");
  return status as ScheduleSeasonStatus;
}

export async function GET(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const seasons = await prisma.scheduleSeason.findMany({
      where: { organizationId: auth.organizationId },
      orderBy: [{ seasonYear: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ organizationId: auth.organizationId, data: seasons });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as SeasonPayload;
    if (typeof body.seasonYear !== "number" || !Number.isInteger(body.seasonYear)) {
      return NextResponse.json({ error: "seasonYear is required" }, { status: 400 });
    }
    const season = await prisma.scheduleSeason.create({
      data: {
        organizationId: auth.organizationId,
        seasonYear: body.seasonYear,
        name: requireString(body.name, "name"),
        status: parseSeasonStatus(body.status) || "DRAFT",
        startsOn: parseDate(body.startsOn, "startsOn"),
        endsOn: parseDate(body.endsOn, "endsOn"),
        defaultGameTimes: parseStringArray(body.defaultGameTimes, "defaultGameTimes"),
        settings: body.settings && typeof body.settings === "object" ? body.settings : {},
      },
    });
    return NextResponse.json({ data: season }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as SeasonPayload;
    const id = requireString(body.id, "id");
    const existing = await prisma.scheduleSeason.findFirst({ where: { id, organizationId: auth.organizationId } });
    if (!existing) return NextResponse.json({ error: "Schedule season not found" }, { status: 404 });

    const season = await prisma.scheduleSeason.update({
      where: { id },
      data: {
        ...(typeof body.seasonYear === "number" && Number.isInteger(body.seasonYear) ? { seasonYear: body.seasonYear } : {}),
        ...(typeof body.name === "string" ? { name: requireString(body.name, "name") } : {}),
        ...(body.status !== undefined ? { status: parseSeasonStatus(body.status) } : {}),
        ...(body.startsOn !== undefined ? { startsOn: parseDate(body.startsOn, "startsOn") } : {}),
        ...(body.endsOn !== undefined ? { endsOn: parseDate(body.endsOn, "endsOn") } : {}),
        ...(body.defaultGameTimes !== undefined ? { defaultGameTimes: parseStringArray(body.defaultGameTimes, "defaultGameTimes") } : {}),
        ...(body.settings && typeof body.settings === "object" ? { settings: body.settings } : {}),
      },
    });
    return NextResponse.json({ data: season });
  } catch (error) {
    return jsonError(error);
  }
}
