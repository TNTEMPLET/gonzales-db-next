import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";
import { isMasterDeployment } from "@/lib/siteConfig";

function forbidIfNotMaster() {
  if (!isMasterDeployment()) {
    return NextResponse.json(
      { error: "All-Star Vault is only managed from master deployment" },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const cycleId = request.nextUrl.searchParams.get("cycleId")?.trim();
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    include: {
      candidates: {
        where: { isActive: true },
      },
      voteSubmissions: {
        include: { voteItems: true },
      },
    },
  });
  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const ratingsByCandidate = new Map<string, number[]>();
  for (const submission of cycle.voteSubmissions) {
    for (const item of submission.voteItems) {
      const bucket = ratingsByCandidate.get(item.candidateId) || [];
      bucket.push(item.rating);
      ratingsByCandidate.set(item.candidateId, bucket);
    }
  }

  const summary = cycle.candidates
    .map((candidate) => {
      const ratings = ratingsByCandidate.get(candidate.id) || [];
      const voteCount = ratings.length;
      const averageRating = voteCount
        ? ratings.reduce((sum, value) => sum + value, 0) / voteCount
        : 0;
      return {
        candidateId: candidate.id,
        playerFullName: candidate.playerFullName,
        team: candidate.team,
        jerseyNumber: candidate.jerseyNumber,
        showcaseBibNumber: candidate.showcaseBibNumber,
        voteCount,
        averageRating: Number(averageRating.toFixed(3)),
      };
    })
    .sort((a, b) => {
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
      return a.playerFullName.localeCompare(b.playerFullName);
    });

  return NextResponse.json({
    data: summary,
    meta: {
      candidateCount: cycle.candidates.length,
      submissionCount: cycle.voteSubmissions.length,
    },
  });
}
