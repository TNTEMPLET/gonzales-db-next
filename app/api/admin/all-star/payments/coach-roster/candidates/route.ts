import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCycleTierDisplayLabel } from "@/lib/allStar/cycleUiLabels";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/all-star/payments/coach-roster/candidates
 *
 * Returns unselected (un-finalized) candidates from the specified source cycles.
 * "Unselected" means finalRosterOverride IS NULL — they haven't been placed on
 * any team's final All-Star roster yet.
 *
 * Query params:
 *   cycleIds  – comma-separated list of ballot cycle IDs to browse
 *
 * Master admin only (same page-level restriction as the cross-org summary).
 */
export async function GET(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminUser.isMaster)
    return NextResponse.json({ error: "Forbidden — master admin only" }, { status: 403 });

  const cycleIdsParam = request.nextUrl.searchParams.get("cycleIds") ?? "";
  const cycleIds = cycleIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (cycleIds.length === 0) {
    return NextResponse.json({ error: "cycleIds is required" }, { status: 400 });
  }

  // Fetch cycle metadata to build display names
  const cycles = await prisma.allStarBallotCycle.findMany({
    where: { id: { in: cycleIds } },
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
      allStarAgeGroupLabel: true,
      title: true,
    },
  });

  const cycleMap = new Map(cycles.map((c) => [c.id, c]));

  // Fetch unselected candidates from those cycles
  const candidates = await prisma.allStarCandidate.findMany({
    where: {
      ballotCycleId: { in: cycleIds },
      isActive: true,
      finalRosterOverride: null, // not yet placed on any final roster
    },
    select: {
      id: true,
      ballotCycleId: true,
      playerFullName: true,
      team: true,
      jerseyNumber: true,
    },
    orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
  });

  // Group by cycle, preserving the requested order
  const byCycle = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const list = byCycle.get(c.ballotCycleId) ?? [];
    list.push(c);
    byCycle.set(c.ballotCycleId, list);
  }

  const result = cycleIds
    .map((id) => {
      const cycle = cycleMap.get(id);
      if (!cycle) return null;
      const orgId = cycle.organizationId as "gonzales" | "ascension";
      const ageLabel = cycle.allStarAgeGroupLabel ?? cycle.ageGroup;
      const teamColor = getCycleTierDisplayLabel(orgId, cycle.title);
      const cycleName = `${cycle.seasonYear} - ${ageLabel} - ${teamColor}`;
      const cycCandidates = (byCycle.get(id) ?? []).map((c) => ({
        id: c.id,
        playerFullName: c.playerFullName,
        team: c.team,
        jerseyNumber: c.jerseyNumber,
      }));
      return { cycleId: id, cycleName, candidates: cycCandidates };
    })
    .filter(Boolean);

  return NextResponse.json({ candidatesByCycle: result });
}
