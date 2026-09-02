import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";
import { normalizeLooseName } from "@/app/api/admin/teams/import/route";
import { toCsvDocument } from "@/lib/export/csv";
import prisma from "@/lib/prisma";
import type { TeamCoachRole } from "@prisma/client";

type ExportRow = {
  teamName: string;
  fullName: string;
  playerId: string | null;
};

type PersonnelRow = {
  teamName: string;
  personnelName: string;
  personnelRole: string;
  volunteerId: string | null;
  volunteerTypeId: string | null;
};

const TEAM_COACH_ROLE_LABELS: Record<TeamCoachRole, string> = {
  HEAD_COACH: "Head Coach",
  ASSISTANT_COACH: "Assistant Coach",
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
}): Promise<{
  rows: ExportRow[];
  totalPlayers: number;
  unresolvedCount: number;
  personnelRows: PersonnelRow[];
  totalPersonnel: number;
  unresolvedPersonnelCount: number;
}> {
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
      coachAssignments: {
        select: {
          role: true,
          registeredUser: { select: { id: true, name: true, firstName: true, lastName: true } },
        },
      },
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

  const registeredUserIds = Array.from(
    new Set(teams.flatMap((t) => t.coachAssignments.map((a) => a.registeredUser.id))),
  );
  const orgProfiles = registeredUserIds.length
    ? await prisma.registeredUserOrgProfile.findMany({
        where: { registeredUserId: { in: registeredUserIds }, organizationId: session.organizationId },
        select: { registeredUserId: true, sportsConnectVolunteerId: true, sportsConnectVolunteerTypeId: true },
      })
    : [];
  const orgProfileByUserId = new Map(orgProfiles.map((p) => [p.registeredUserId, p]));

  const rows: ExportRow[] = [];
  let unresolvedCount = 0;
  const personnelRows: PersonnelRow[] = [];
  let unresolvedPersonnelCount = 0;

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
    for (const assignment of team.coachAssignments) {
      const profile = orgProfileByUserId.get(assignment.registeredUser.id);
      const volunteerId = profile?.sportsConnectVolunteerId ?? null;
      const volunteerTypeId = profile?.sportsConnectVolunteerTypeId ?? null;
      if (!volunteerId) unresolvedPersonnelCount += 1;
      const personnelName =
        assignment.registeredUser.name ||
        [assignment.registeredUser.firstName, assignment.registeredUser.lastName].filter(Boolean).join(" ");
      personnelRows.push({
        teamName,
        personnelName,
        personnelRole: TEAM_COACH_ROLE_LABELS[assignment.role],
        volunteerId,
        volunteerTypeId,
      });
    }
  }

  rows.sort((a, b) => a.teamName.localeCompare(b.teamName) || a.fullName.localeCompare(b.fullName));
  personnelRows.sort(
    (a, b) => a.teamName.localeCompare(b.teamName) || a.personnelName.localeCompare(b.personnelName),
  );

  return {
    rows,
    totalPlayers: rows.length,
    unresolvedCount,
    personnelRows,
    totalPersonnel: personnelRows.length,
    unresolvedPersonnelCount,
  };
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

    const {
      rows,
      totalPlayers,
      unresolvedCount,
      personnelRows,
      totalPersonnel,
      unresolvedPersonnelCount,
    } = await buildExportRows(session);

    const isPreview = req.nextUrl.searchParams.get("preview") === "1";
    if (isPreview) {
      return NextResponse.json({
        rows,
        totalPlayers,
        unresolvedCount,
        personnelRows,
        totalPersonnel,
        unresolvedPersonnelCount,
      });
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
    const csv = toCsvDocument(header, [
      ...rows.map((r) => [r.teamName, r.playerId ?? "", "", "", r.fullName, "", ""]),
      ...personnelRows.map((r) => [
        r.teamName,
        "",
        r.volunteerId ?? "",
        r.volunteerTypeId ?? "",
        "",
        r.personnelName,
        r.personnelRole,
      ]),
    ]);

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
