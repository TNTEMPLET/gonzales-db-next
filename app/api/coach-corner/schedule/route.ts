import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import prisma from "@/lib/prisma";
import { toLegacyScheduleGame } from "@/lib/schedule/publicSchedule";
import {
  loadPublicScheduleGames,
  loadPublicScheduleWindow,
} from "@/lib/schedule/publicScheduleLoad";
import type { ContentOrgId } from "@/lib/siteConfig";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const actor = await resolveCoachCornerActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = request.nextUrl.searchParams.get("teamId")?.trim();
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      coachAssignments: { select: { registeredUserId: true } },
      gameNotes: true,
    },
  });
  if (!team || team.organizationId !== actor.targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const canView =
    actor.isAdmin ||
    team.coachAssignments.some(
      (assignment) => assignment.registeredUserId === actor.registeredUserId,
    );
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const window = await loadPublicScheduleWindow(actor.targetOrg as ContentOrgId);
  const startDate = request.nextUrl.searchParams.get("startDate") || window.startDate;
  const endDate = request.nextUrl.searchParams.get("endDate") || window.endDate;
  const games = await loadPublicScheduleGames({
    org: actor.targetOrg as ContentOrgId,
    startDate,
    endDate,
  });
  const notesByGameId = new Map(
    team.gameNotes.map((note) => [note.gameExternalId, note]),
  );
  const teamNameNorm = normalize(team.teamName);
  const ageGroupNorm = normalize(team.ageGroup);
  const filtered = games
    .filter((game) => {
      if (game.homeTeamId === team.id || game.awayTeamId === team.id) return true;
      if (normalize(game.ageGroup) !== ageGroupNorm) return false;
      return normalize(game.homeTeam) === teamNameNorm || normalize(game.awayTeam) === teamNameNorm;
    })
    .map((game) => {
      const legacy = toLegacyScheduleGame(game);
      return {
        ...legacy,
        gameNote: notesByGameId.get(String(game.id)) || null,
      };
    });

  return NextResponse.json({
    team: {
      id: team.id,
      organizationId: team.organizationId,
      seasonYear: team.seasonYear,
      ageGroup: team.ageGroup,
      teamName: team.teamName,
    },
    data: filtered,
  });
}
