import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/news/auth";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { SchedulerError } from "./types";
import { parseStringArray, schedulerErrorResponse } from "./validation";

export async function requireSchedulerAdmin(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status }),
    };
  }
  return {
    ok: true as const,
    organizationId: resolveAdminTargetOrg(request.nextUrl.searchParams.get("org")),
  };
}

export function jsonError(error: unknown) {
  const payload = schedulerErrorResponse(error);
  return NextResponse.json(
    { error: payload.error, code: payload.code, details: payload.details },
    { status: payload.status },
  );
}

export function requestId(request: NextRequest, name: string): string | null {
  const value = request.nextUrl.searchParams.get(name);
  return value && value.trim() ? value.trim() : null;
}

export async function requireSeason(organizationId: string, seasonId: string) {
  const season = await prisma.scheduleSeason.findFirst({
    where: { id: seasonId, organizationId },
  });
  if (!season) {
    throw new SchedulerError("Schedule season was not found", "MISSING_SEASON", { seasonId });
  }
  return season;
}

export function parseJsonArrayField(value: unknown, field: string): Prisma.InputJsonValue {
  return parseStringArray(value, field);
}

export async function loadGenerationContext(params: {
  organizationId: string;
  seasonId: string;
  divisions?: string[];
}) {
  const season = await requireSeason(params.organizationId, params.seasonId);
  const rules = await prisma.scheduleDivisionRule.findMany({
    where: {
      organizationId: params.organizationId,
      seasonId: season.id,
      ...(params.divisions?.length ? { division: { in: params.divisions } } : {}),
    },
    orderBy: [{ division: "asc" }, { ageGroup: "asc" }],
  });
  const ageGroups = [...new Set(rules.map((rule) => rule.ageGroup || rule.division))];
  const [teams, fields, availabilities] = await Promise.all([
    prisma.team.findMany({
      where: {
        organizationId: params.organizationId,
        seasonYear: season.seasonYear,
        ...(ageGroups.length ? { ageGroup: { in: ageGroups } } : {}),
      },
      orderBy: [{ ageGroup: "asc" }, { teamName: "asc" }],
    }),
    prisma.scheduleField.findMany({
      where: { organizationId: params.organizationId, isActive: true },
      include: { park: true },
      orderBy: [{ park: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.scheduleFieldAvailability.findMany({
      where: {
        organizationId: params.organizationId,
        OR: [{ seasonId: season.id }, { seasonId: null }],
      },
      orderBy: [{ date: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
  ]);

  return { season, rules, teams, fields, availabilities };
}
