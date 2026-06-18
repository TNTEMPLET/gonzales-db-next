import { NextRequest, NextResponse } from "next/server";

import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import {
  defaultBracketSpec,
  safeParseBracketSpec,
  type BracketSpec,
  type BracketTournamentInfo,
  type BracketVisualTuning,
} from "@/lib/tournament-brackets/bracketSpec";
import {
  getOfficialTemplate,
  specDefaultsFromOfficialTemplate,
  type OfficialTemplateId,
} from "@/lib/tournament-brackets/officialTemplates";
import type { ChampionshipSeriesStyle } from "@/lib/tournament-brackets/bracketFormat";
import prisma from "@/lib/prisma";
import { isBracketOrgId, type BracketOrgId } from "@/lib/siteConfig";

const SHARED_TOURNAMENT_INFO_KEYS = [
  "sites",
  "updatePhone",
  "tournamentDirector",
  "nextLevel",
] as const satisfies readonly (keyof BracketTournamentInfo)[];

function sharedTournamentInfoFromSpec(spec: BracketSpec): Omit<BracketTournamentInfo, "division"> | null {
  const info = spec.tournamentInfo;
  if (!info) return null;
  const shared: Omit<BracketTournamentInfo, "division"> = {};
  for (const key of SHARED_TOURNAMENT_INFO_KEYS) {
    const value = info[key]?.trim();
    if (value) shared[key] = value;
  }
  return Object.keys(shared).length > 0 ? shared : null;
}

async function findRecentTournamentInfoDefaults(
  organizationId: BracketOrgId,
  seasonYear: number,
): Promise<{
  tournamentInfo: Omit<BracketTournamentInfo, "division"> | null;
  visualTuning: BracketVisualTuning | null;
}> {
  const recent = await prisma.bracketProject.findMany({
    where: { organizationId, seasonYear },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { spec: true },
  });
  let tournamentInfo: Omit<BracketTournamentInfo, "division"> | null = null;
  let visualTuning: BracketVisualTuning | null = null;
  for (const row of recent) {
    const parsed = safeParseBracketSpec(row.spec);
    tournamentInfo ??= sharedTournamentInfoFromSpec(parsed.spec);
    if (!visualTuning && parsed.spec.visualTuning && Object.keys(parsed.spec.visualTuning).length > 0) {
      visualTuning = parsed.spec.visualTuning;
    }
    if (tournamentInfo && visualTuning) break;
  }
  return { tournamentInfo, visualTuning };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await ensureTournamentBracketsMaster(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const org = request.nextUrl.searchParams.get("organizationId");
    const where =
      org && isBracketOrgId(org) ? { organizationId: org as BracketOrgId } : {};

    const projects = await prisma.bracketProject.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        organizationId: true,
        seasonYear: true,
        name: true,
        status: true,
        priority: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: projects });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: message,
        hint:
          /does not exist|Unknown model|BracketProject/i.test(message)
            ? "Apply database migrations: npx prisma migrate deploy"
            : undefined,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await ensureTournamentBracketsMaster(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    let body: {
      organizationId?: string;
      seasonYear?: number;
      name?: string;
      priority?: number;
      officialTemplateId?: string;
      championshipSeriesStyle?: ChampionshipSeriesStyle;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.organizationId || !isBracketOrgId(body.organizationId)) {
      return NextResponse.json(
        { error: "organizationId must be a valid bracket org" },
        { status: 400 },
      );
    }
    const organizationId = body.organizationId as BracketOrgId;
    const seasonYear =
      typeof body.seasonYear === "number" && Number.isFinite(body.seasonYear)
        ? body.seasonYear
        : new Date().getFullYear();
    const name = body.name?.trim() || `Bracket ${seasonYear}`;
    const priority =
      typeof body.priority === "number" && Number.isFinite(body.priority)
        ? Math.trunc(body.priority)
        : 0;

    const requestedTemplateId = body.officialTemplateId?.trim();
    const requestedTemplate = requestedTemplateId ? getOfficialTemplate(requestedTemplateId) : undefined;
    const requestedChampionshipStyle =
      body.championshipSeriesStyle === "always_scheduled_reset" ||
      body.championshipSeriesStyle === "winner_take_all"
        ? body.championshipSeriesStyle
        : undefined;
    if (body.championshipSeriesStyle && !requestedChampionshipStyle) {
      return NextResponse.json(
        { error: "championshipSeriesStyle must be always_scheduled_reset or winner_take_all" },
        { status: 400 },
      );
    }
    const spec = defaultBracketSpec();
    if (requestedTemplate) {
      Object.assign(
        spec,
        specDefaultsFromOfficialTemplate(
          requestedTemplate.id as OfficialTemplateId,
          requestedChampionshipStyle,
        ),
      );
    } else if (requestedTemplateId) {
      return NextResponse.json(
        { error: `Unknown officialTemplateId: ${requestedTemplateId}` },
        { status: 400 },
      );
    }
    const defaults = await findRecentTournamentInfoDefaults(organizationId, seasonYear);
    if (defaults.tournamentInfo) {
      spec.tournamentInfo = {
        division: name,
        ...defaults.tournamentInfo,
      };
    }
    if (defaults.visualTuning) {
      spec.visualTuning = defaults.visualTuning;
    }
    spec.divisionLabel = name;
    spec.championAgeGroupLabel = name;

    const created = await prisma.bracketProject.create({
      data: {
        organizationId,
        seasonYear,
        name,
        priority,
        spec: JSON.parse(JSON.stringify(spec)),
        sourceArtifactUrls: [],
        createdByAdminId: auth.adminUserId,
      },
    });

    return NextResponse.json({ data: created });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: message,
        hint:
          /does not exist|Unknown model|BracketProject/i.test(message)
            ? "Apply database migrations: npx prisma migrate deploy"
            : undefined,
      },
      { status: 500 },
    );
  }
}
