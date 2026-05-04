import { NextRequest, NextResponse } from "next/server";

import {
  ensureVoterCanAccessCycle,
  resolveAllStarVoterFromRequest,
} from "@/lib/allStar/voterAuth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cycleId = request.nextUrl.searchParams.get("cycleId");
  const token = request.nextUrl.searchParams.get("token");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const voter = await resolveAllStarVoterFromRequest(request, { cycleId, token });
  if (!voter) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await ensureVoterCanAccessCycle(voter, cycleId, token || null);
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    include: {
      candidates: { where: { isActive: true }, orderBy: [{ team: "asc" }, { jerseyNumber: "asc" }] },
    },
  });
  if (!cycle) return NextResponse.json({ error: "Ballot cycle not found" }, { status: 404 });

  const inviteId = access.invite?.id || null;
  if (access.invite && !access.invite.openedAt) {
    await prisma.allStarInvite.update({
      where: { id: access.invite.id },
      data: { openedAt: new Date() },
    });
  }

  const submission = await prisma.allStarVoteSubmission.findUnique({
    where: {
      ballotCycleId_coachUserId: {
        ballotCycleId: cycle.id,
        coachUserId: voter.id,
      },
    },
  });
  const draft = await prisma.allStarVoteDraft.findUnique({
    where: {
      ballotCycleId_coachUserId: {
        ballotCycleId: cycle.id,
        coachUserId: voter.id,
      },
    },
  });

  return NextResponse.json({
    cycle: {
      id: cycle.id,
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      title: cycle.title,
      hasShowcase: cycle.hasShowcase,
      status: cycle.status,
      accessMode: cycle.accessMode,
    },
    candidates: cycle.candidates,
    draft: draft?.ratingsPayload || {},
    hasSubmitted: Boolean(submission),
    inviteId,
  });
}
