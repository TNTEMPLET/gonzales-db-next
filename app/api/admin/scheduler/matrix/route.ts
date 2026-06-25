import { NextResponse, type NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { jsonError, requireSchedulerAdmin, requestId, requireSeason } from "@/lib/scheduler/api";
import { parseStringArray, requireString } from "@/lib/scheduler/validation";

type RulePayload = {
  id?: unknown;
  division?: unknown;
  ageGroup?: unknown;
  preferredParkId?: unknown;
  preferredFieldId?: unknown;
  allowedParkIds?: unknown;
  allowedFieldIds?: unknown;
  allowedGameTimes?: unknown;
  minDaysBetweenGames?: unknown;
  maxGamesPerWeek?: unknown;
  avoidBackToBack?: unknown;
  ruleMetadata?: unknown;
};

type MatrixPayload = {
  seasonId?: unknown;
  rules?: RulePayload[];
};

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error("Expected an integer value");
  return value;
}

function ruleData(rule: RulePayload, organizationId: string, seasonId: string) {
  return {
    organizationId,
    seasonId,
    division: requireString(rule.division, "division"),
    ageGroup: nullableString(rule.ageGroup),
    preferredParkId: nullableString(rule.preferredParkId),
    preferredFieldId: nullableString(rule.preferredFieldId),
    allowedParkIds: parseStringArray(rule.allowedParkIds, "allowedParkIds"),
    allowedFieldIds: parseStringArray(rule.allowedFieldIds, "allowedFieldIds"),
    allowedGameTimes: parseStringArray(rule.allowedGameTimes, "allowedGameTimes"),
    minDaysBetweenGames: nullableInt(rule.minDaysBetweenGames),
    maxGamesPerWeek: nullableInt(rule.maxGamesPerWeek),
    avoidBackToBack: typeof rule.avoidBackToBack === "boolean" ? rule.avoidBackToBack : true,
    ruleMetadata: rule.ruleMetadata && typeof rule.ruleMetadata === "object" ? rule.ruleMetadata : {},
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const seasonId = requestId(request, "seasonId");
    if (!seasonId) return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    await requireSeason(auth.organizationId, seasonId);
    const rules = await prisma.scheduleDivisionRule.findMany({
      where: { organizationId: auth.organizationId, seasonId },
      include: { preferredPark: true, preferredField: true },
      orderBy: [{ division: "asc" }, { ageGroup: "asc" }],
    });
    return NextResponse.json({ organizationId: auth.organizationId, seasonId, data: rules });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as MatrixPayload;
    const seasonId = requireString(body.seasonId, "seasonId");
    await requireSeason(auth.organizationId, seasonId);
    const rules = Array.isArray(body.rules) ? body.rules : [];
    if (!rules.length) return NextResponse.json({ error: "At least one matrix rule is required" }, { status: 400 });

    await prisma.$transaction([
      prisma.scheduleDivisionRule.deleteMany({ where: { organizationId: auth.organizationId, seasonId } }),
      prisma.scheduleDivisionRule.createMany({
        data: rules.map((rule) => ruleData(rule, auth.organizationId, seasonId)),
      }),
    ]);

    const saved = await prisma.scheduleDivisionRule.findMany({
      where: { organizationId: auth.organizationId, seasonId },
      orderBy: [{ division: "asc" }, { ageGroup: "asc" }],
    });
    return NextResponse.json({ organizationId: auth.organizationId, seasonId, data: saved });
  } catch (error) {
    return jsonError(error);
  }
}
