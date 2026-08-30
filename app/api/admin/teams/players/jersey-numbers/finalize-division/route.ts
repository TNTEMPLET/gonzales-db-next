import { NextRequest, NextResponse } from "next/server";

import { assignJerseyNumbersForTeam } from "@/lib/admin/jerseyNumbers";
import type { UnmatchedJerseySize } from "@/lib/admin/jerseySizes";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

/**
 * Numbers jerseys for every real team in a division at once — the explicit
 * "I'm done building rosters, finalize this division" action for teams
 * built by direct import rather than the online draft (which numbers each
 * team automatically as it materializes; see lib/draft/materializeDraft.ts).
 * Teams still named "Unallocated" are skipped — their roster isn't final
 * yet, so numbering it would just be thrown away on the next real import.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json().catch(() => ({}))) as {
    seasonYear?: number;
    ageGroup?: string;
  };
  const seasonYear = Number(body.seasonYear);
  const ageGroup = body.ageGroup?.trim();
  if (!Number.isFinite(seasonYear) || !ageGroup) {
    return NextResponse.json({ error: "seasonYear and ageGroup are required" }, { status: 400 });
  }

  const teams = await prisma.team.findMany({
    where: {
      organizationId: targetOrg,
      seasonYear,
      ageGroup,
      NOT: { teamName: { equals: "Unallocated", mode: "insensitive" } },
    },
    select: { id: true, teamName: true },
  });

  const results: Array<{ teamName: string; assigned: number; unmatchedSizes: UnmatchedJerseySize[] }> = [];
  const skippedEmpty: string[] = [];
  for (const team of teams) {
    const result = await assignJerseyNumbersForTeam(prisma, team.id);
    if (!result) {
      skippedEmpty.push(team.teamName);
      continue;
    }
    results.push({ teamName: team.teamName, ...result });
  }

  if (teams.length === 0) {
    return NextResponse.json(
      { error: "No finalized teams found in this division (only \"Unallocated\" or none at all)" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    teamsNumbered: results.length,
    totalAssigned: results.reduce((sum, r) => sum + r.assigned, 0),
    unmatchedSizes: results.flatMap((r) => r.unmatchedSizes),
    skippedEmptyTeams: skippedEmpty,
  });
}
