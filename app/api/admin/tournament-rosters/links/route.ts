import { NextRequest, NextResponse } from "next/server";

import { createRosterIntakeToken, rosterTokenHash } from "@/lib/tournament-rosters/tokens";
import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import { isBracketOrgId } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

type LinkBody = {
  organizationId?: string;
  seasonYear?: number;
  bracketProjectId?: string | null;
  teams?: Array<{ teamName: string; ageGroup?: string | null }>;
};

function readableUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) return value.map(readableUnknown).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value ?? "");
}

function routeError(err: unknown, fallback: string) {
  const message = readableUnknown(err) || fallback;
  const hint = /TournamentRoster|does not exist|table.*not found|Unknown model/i.test(message)
    ? "Roster intake database tables are missing. Apply the Prisma schema to the connected database."
    : undefined;
  return NextResponse.json({ error: message || fallback, hint }, { status: 500 });
}

function publicUrl(request: NextRequest, token: string) {
  return `${request.nextUrl.origin}/tournament-rosters/${encodeURIComponent(token)}`;
}

function linkSelect() {
  return {
    id: true,
    organizationId: true,
    seasonYear: true,
    bracketProjectId: true,
    teamName: true,
    ageGroup: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    submissions: {
      orderBy: { createdAt: "desc" as const },
      take: 3,
      include: { players: { orderBy: { rowNumber: "asc" as const } } },
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await ensureTournamentBracketsMaster(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!isBracketOrgId(organizationId)) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    const seasonYear = Number.parseInt(request.nextUrl.searchParams.get("seasonYear") ?? "", 10);
    if (!Number.isFinite(seasonYear)) return NextResponse.json({ error: "seasonYear is required" }, { status: 400 });
    const bracketProjectId = request.nextUrl.searchParams.get("bracketProjectId")?.trim() || null;
    const links = await prisma.tournamentRosterIntakeLink.findMany({
      where: { organizationId, seasonYear, bracketProjectId },
      orderBy: [{ teamName: "asc" }],
      select: linkSelect(),
    });
    return NextResponse.json({ data: links });
  } catch (err: unknown) {
    return routeError(err, "Failed to load roster links");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await ensureTournamentBracketsMaster(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
    const body = (await request.json()) as LinkBody;
    if (!isBracketOrgId(body.organizationId)) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    const seasonYear = Number.isFinite(body.seasonYear) ? Math.trunc(body.seasonYear!) : null;
    if (!seasonYear) return NextResponse.json({ error: "seasonYear is required" }, { status: 400 });
    const bracketProjectId = body.bracketProjectId?.trim() || null;
    const teams = (body.teams ?? [])
      .map((team) => ({ teamName: team.teamName.trim(), ageGroup: team.ageGroup?.trim() || null }))
      .filter((team) => team.teamName);
    if (!teams.length) return NextResponse.json({ error: "At least one team is required" }, { status: 400 });

    const created: Array<{ linkId: string; teamName: string; publicUrl: string }> = [];
    for (const team of teams) {
      const existing = await prisma.tournamentRosterIntakeLink.findFirst({
        where: { organizationId: body.organizationId, seasonYear, bracketProjectId, teamName: team.teamName },
      });
      if (existing) continue;
      const token = createRosterIntakeToken();
      const link = await prisma.tournamentRosterIntakeLink.create({
        data: {
          organizationId: body.organizationId,
          seasonYear,
          bracketProjectId,
          teamName: team.teamName,
          ageGroup: team.ageGroup,
          tokenHash: rosterTokenHash(token),
          createdByAdminId: auth.adminUserId,
        },
      });
      created.push({ linkId: link.id, teamName: link.teamName, publicUrl: publicUrl(request, token) });
    }

    const links = await prisma.tournamentRosterIntakeLink.findMany({
      where: { organizationId: body.organizationId, seasonYear, bracketProjectId },
      orderBy: [{ teamName: "asc" }],
      select: linkSelect(),
    });
    return NextResponse.json({ data: { links, created } });
  } catch (err: unknown) {
    return routeError(err, "Failed to create roster links");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await ensureTournamentBracketsMaster(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
    const body = (await request.json()) as { linkId?: string; action?: "regenerate" | "disable" | "enable" };
    if (!body.linkId) return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    const existing = await prisma.tournamentRosterIntakeLink.findUnique({ where: { id: body.linkId } });
    if (!existing) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    if (body.action === "regenerate") {
      const token = createRosterIntakeToken();
      const link = await prisma.tournamentRosterIntakeLink.update({
        where: { id: existing.id },
        data: { tokenHash: rosterTokenHash(token), status: "ACTIVE", disabledAt: null },
        select: linkSelect(),
      });
      return NextResponse.json({ data: { link, publicUrl: publicUrl(request, token) } });
    }
    const status = body.action === "enable" ? "ACTIVE" : "DISABLED";
    const link = await prisma.tournamentRosterIntakeLink.update({
      where: { id: existing.id },
      data: { status, disabledAt: status === "DISABLED" ? new Date() : null },
      select: linkSelect(),
    });
    return NextResponse.json({ data: { link } });
  } catch (err: unknown) {
    return routeError(err, "Failed to update roster link");
  }
}
