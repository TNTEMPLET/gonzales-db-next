import { NextRequest, NextResponse } from "next/server";

import {
  ensureVoterCanAccessCycle,
  resolveAllStarVoterFromRequest,
} from "@/lib/allStar/voterAuth";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const voter = await resolveAllStarVoterFromRequest(request);
  if (!voter) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    cycleId?: string;
    token?: string;
    ratings?: Record<string, number>;
  };
  if (!body.cycleId || !body.ratings || typeof body.ratings !== "object") {
    return NextResponse.json({ error: "cycleId and ratings are required" }, { status: 400 });
  }

  const access = await ensureVoterCanAccessCycle(
    voter,
    body.cycleId,
    body.token || null,
  );
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const existing = await prisma.allStarVoteSubmission.findUnique({
    where: {
      ballotCycleId_coachUserId: {
        ballotCycleId: body.cycleId,
        coachUserId: voter.id,
      },
    },
  });
  if (existing) return NextResponse.json({ error: "Ballot already submitted" }, { status: 409 });

  const candidateIds = Object.keys(body.ratings);
  if (!candidateIds.length) return NextResponse.json({ error: "At least one rating is required" }, { status: 400 });

  const candidates = await prisma.allStarCandidate.findMany({
    where: {
      ballotCycleId: body.cycleId,
      id: { in: candidateIds },
      isActive: true,
    },
    select: { id: true },
  });
  const candidateSet = new Set(candidates.map((candidate) => candidate.id));

  const voteItems = candidateIds
    .filter((id) => candidateSet.has(id))
    .map((id) => ({ candidateId: id, rating: Number(body.ratings?.[id]) }));
  if (!voteItems.length) {
    return NextResponse.json({ error: "No valid candidate ratings found" }, { status: 400 });
  }
  if (voteItems.some((item) => item.rating < 1 || item.rating > 5 || !Number.isFinite(item.rating))) {
    return NextResponse.json({ error: "Ratings must be numbers between 1 and 5" }, { status: 400 });
  }

  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.allStarVoteSubmission.create({
      data: {
        ballotCycleId: body.cycleId!,
        coachUserId: voter.id,
        organizationId: access.cycle.organizationId,
        ageGroup: access.cycle.ageGroup,
      },
    });
    await tx.allStarVoteItem.createMany({
      data: voteItems.map((item) => ({
        voteSubmissionId: created.id,
        candidateId: item.candidateId,
        rating: item.rating,
      })),
    });
    await tx.allStarVoteDraft.deleteMany({
      where: {
        ballotCycleId: body.cycleId!,
        coachUserId: voter.id,
      },
    });
    return created;
  });

  return NextResponse.json({ success: true, submissionId: submission.id });
}
