import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import { parseAllStarPhase } from "@/lib/allStar/phase";
import { computeVoteSummaryRows } from "@/lib/allStar/voteSummary";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId")?.trim();
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const phase = parseAllStarPhase(request.nextUrl.searchParams.get("phase"));
  const computed = await computeVoteSummaryRows(prisma, cycleId, phase ?? undefined);
  if (!computed) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const { rows: summary, submissionCount, cycle } = computed;

  const runoffMeta =
    cycle.runoffFirstTeamSize != null && cycle.runoffPoolSize != null
      ? {
          firstTeamSize: cycle.runoffFirstTeamSize,
          poolSize: cycle.runoffPoolSize,
          parentBallotCycleId: cycle.parentBallotCycleId,
        }
      : null;

  return NextResponse.json({
    data: summary,
    meta: {
      candidateCount: summary.length,
      submissionCount,
      runoff: runoffMeta,
    },
  });
}
