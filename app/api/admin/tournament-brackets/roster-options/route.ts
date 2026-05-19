import { NextRequest, NextResponse } from "next/server";

import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import prisma from "@/lib/prisma";

function parseSeasonYear(value: string | null): number | null {
  if (!value) return null;
  const year = Number.parseInt(value, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return null;
  return year;
}

function sortAgeGroupLabel(a: string, b: string) {
  const numA = Number.parseInt(a, 10);
  const numB = Number.parseInt(b, 10);
  if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
  if (Number.isFinite(numA)) return -1;
  if (Number.isFinite(numB)) return 1;
  return a.localeCompare(b, "en-US", { numeric: true, sensitivity: "base" });
}

export async function GET(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim();
  const seasonYear = parseSeasonYear(request.nextUrl.searchParams.get("seasonYear"));

  if (!organizationId || seasonYear == null) {
    return NextResponse.json(
      { error: "organizationId and seasonYear query parameters are required." },
      { status: 400 },
    );
  }

  const rows = await prisma.team.findMany({
    where: { organizationId, seasonYear },
    select: { id: true, ageGroup: true, teamName: true },
    orderBy: [{ ageGroup: "asc" }, { teamName: "asc" }],
  });

  const teamsByAgeGroup: Record<string, { id: string; teamName: string }[]> = {};
  for (const row of rows) {
    const ag = row.ageGroup.trim();
    if (!ag) continue;
    if (!teamsByAgeGroup[ag]) teamsByAgeGroup[ag] = [];
    teamsByAgeGroup[ag].push({ id: row.id, teamName: row.teamName });
  }

  const ageGroups = Object.keys(teamsByAgeGroup).sort(sortAgeGroupLabel);

  return NextResponse.json({ ageGroups, teamsByAgeGroup });
}
