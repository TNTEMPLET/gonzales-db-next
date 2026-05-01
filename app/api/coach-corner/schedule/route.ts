import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import { fetchGames } from "@/lib/fetchGames";
import prisma from "@/lib/prisma";
import { getAssignrLeagueId } from "@/lib/siteConfig";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function defaultDateRange() {
  const start = new Date();
  start.setDate(start.getDate() - start.getDay() + (start.getDay() === 0 ? -6 : 1));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    startDate: start.toISOString().split("T")[0]!,
    endDate: end.toISOString().split("T")[0]!,
  };
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

  const defaults = defaultDateRange();
  const startDate = request.nextUrl.searchParams.get("startDate") || defaults.startDate;
  const endDate = request.nextUrl.searchParams.get("endDate") || defaults.endDate;
  const games = await fetchGames({
    startDate,
    endDate,
    leagueId: getAssignrLeagueId(actor.targetOrg),
  });

  const ageGroupNorm = normalize(team.ageGroup);
  const teamNameNorm = normalize(team.teamName);
  const notesByGameId = new Map(
    team.gameNotes.map((note) => [note.gameExternalId, note]),
  );

  const filtered = games
    .filter((game) => {
      const gameAge = typeof game.age_group === "string" ? normalize(game.age_group) : "";
      const home = typeof game.home_team === "string" ? normalize(game.home_team) : "";
      const away = typeof game.away_team === "string" ? normalize(game.away_team) : "";
      return gameAge === ageGroupNorm && (home === teamNameNorm || away === teamNameNorm);
    })
    .map((game) => ({
      ...game,
      gameNote: notesByGameId.get(String(game.id)) || null,
    }));

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
