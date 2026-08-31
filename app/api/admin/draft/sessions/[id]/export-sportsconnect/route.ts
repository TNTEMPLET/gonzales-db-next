import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";
import { normalizeLooseName } from "@/app/api/admin/teams/import/route";
import { toCsvDocument } from "@/lib/export/csv";
import prisma from "@/lib/prisma";

type ExportRow = {
  teamName: string;
  fullName: string;
  playerId: string | null;
};

/**
 * Resolves each drafted player's SportsConnect Player ID for the
 * SportsConnect "Import Teams" CSV. A freshly-materialized TeamPlayer row
 * has no sportsConnectPlayerId of its own (DraftPlayerPool never carries
 * it), so this falls back to an Enrollment lookup by normalized name --
 * but ONLY when exactly one Enrollment row shares that name in scope. Two
 * or more (a real name collision) is left unresolved rather than guessed,
 * matching the same principle the Player Name Collisions report exists to
 * enforce (lib/sportsConnect/playerNameCollisions.ts).
 */
async function buildExportRows(session: {
  id: string;
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
}): Promise<{ rows: ExportRow[]; totalPlayers: number; unresolvedCount: number }> {
  const draftTeams = await prisma.draftTeam.findMany({
    where: { draftSessionId: session.id, targetTeamId: { not: null } },
    select: { targetTeamId: true },
  });
  const teamIds = draftTeams
    .map((t) => t.targetTeamId)
    .filter((id): id is string => !!id);
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: {
      teamName: true,
      players: { select: { fullName: true, sportsConnectPlayerId: true } },
    },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: {
      organizationId: session.organizationId,
      seasonYear: session.seasonYear,
      ageGroup: session.ageGroup,
    },
    select: { fullName: true, sportsConnectPlayerId: true },
  });
  const enrollmentsByName = new Map<string, { sportsConnectPlayerId: string | null }[]>();
  for (const e of enrollments) {
    const key = normalizeLooseName(e.fullName);
    const list = enrollmentsByName.get(key);
    if (list) list.push(e);
    else enrollmentsByName.set(key, [e]);
  }

  const rows: ExportRow[] = [];
  let unresolvedCount = 0;

  for (const team of teams) {
    const teamName = team.teamName;
    for (const player of team.players) {
      let playerId = player.sportsConnectPlayerId;
      if (!playerId) {
        const candidates = enrollmentsByName.get(normalizeLooseName(player.fullName)) ?? [];
        if (candidates.length === 1 && candidates[0].sportsConnectPlayerId) {
          playerId = candidates[0].sportsConnectPlayerId;
        }
      }
      if (!playerId) unresolvedCount += 1;
      rows.push({ teamName, fullName: player.fullName, playerId: playerId ?? null });
    }
  }

  rows.sort((a, b) => a.teamName.localeCompare(b.teamName) || a.fullName.localeCompare(b.fullName));

  return { rows, totalPlayers: rows.length, unresolvedCount };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const session = await prisma.draftSession.findUnique({
      where: { id },
      select: { id: true, organizationId: true, seasonYear: true, ageGroup: true, status: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Draft session not found" }, { status: 404 });
    }
    if (session.status !== "MATERIALIZED") {
      return NextResponse.json(
        { error: "Materialize the draft before exporting rosters." },
        { status: 400 },
      );
    }

    const { rows, totalPlayers, unresolvedCount } = await buildExportRows(session);

    const isPreview = req.nextUrl.searchParams.get("preview") === "1";
    if (isPreview) {
      return NextResponse.json({ rows, totalPlayers, unresolvedCount });
    }

    const header = [
      "TeamName",
      "PlayerID",
      "VolunteerID",
      "VolunteerTypeID",
      "Player Name",
      "Team Personnel Name",
      "Team Personnel Role",
    ];
    const csv = toCsvDocument(
      header,
      rows.map((r) => [r.teamName, r.playerId ?? "", "", "", r.fullName, "", ""]),
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${session.ageGroup}-${session.seasonYear}-sportsconnect-import.csv"`,
      },
    });
  } catch (e) {
    return draftApiError("session.export-sportsconnect", e);
  }
}
