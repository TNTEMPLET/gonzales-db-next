import { NextRequest, NextResponse } from "next/server";

import {
  ensureVoterCanAccessCycle,
  resolveAllStarVoterFromRequest,
} from "@/lib/allStar/voterAuth";
import { resolveCycleIdForVoteRequest } from "@/lib/allStar/voteCycle";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const cycleIdParam =
    request.nextUrl.searchParams.get("cycleId") || request.nextUrl.searchParams.get("c");
  const token =
    request.nextUrl.searchParams.get("token") || request.nextUrl.searchParams.get("t");
  const cycleId = await resolveCycleIdForVoteRequest(cycleIdParam, token);
  if (!cycleId) {
    return NextResponse.json(
      { error: "Ballot cycle id or shared ballot token (t) is required" },
      { status: 400 },
    );
  }

  const voter = await resolveAllStarVoterFromRequest(request, { cycleId, token });
  if (!voter) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await ensureVoterCanAccessCycle(voter, cycleId, token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const draft = await prisma.allStarVoteDraft.findUnique({
    where: {
      ballotCycleId_coachUserId: {
        ballotCycleId: cycleId,
        coachUserId: voter.id,
      },
    },
  });
  return NextResponse.json({ draft: draft?.ratingsPayload || {} });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    cycleId?: string;
    token?: string;
    ratings?: Record<string, number>;
  };
  if (!body.cycleId || !body.ratings || typeof body.ratings !== "object") {
    return NextResponse.json({ error: "cycleId and ratings are required" }, { status: 400 });
  }
  const voter = await resolveAllStarVoterFromRequest(request, {
    cycleId: body.cycleId,
    token: body.token || null,
  });
  if (!voter) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await ensureVoterCanAccessCycle(
    voter,
    body.cycleId,
    body.token || null,
  );
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const alreadySubmitted = await prisma.allStarVoteSubmission.findUnique({
    where: {
      ballotCycleId_coachUserId: {
        ballotCycleId: body.cycleId,
        coachUserId: voter.id,
      },
    },
    select: { id: true },
  });
  if (alreadySubmitted) {
    return NextResponse.json({ error: "Ballot already submitted and locked" }, { status: 409 });
  }

  await prisma.allStarVoteDraft.upsert({
    where: {
      ballotCycleId_coachUserId: {
        ballotCycleId: body.cycleId,
        coachUserId: voter.id,
      },
    },
    create: {
      ballotCycleId: body.cycleId,
      coachUserId: voter.id,
      organizationId: access.cycle.organizationId,
      ageGroup: access.cycle.ageGroup,
      ratingsPayload: body.ratings,
    },
    update: { ratingsPayload: body.ratings },
  });

  return NextResponse.json({ success: true });
}
