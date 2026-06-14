import { NextRequest, NextResponse } from "next/server";

import { recordAllStarAuditLog } from "@/lib/allStar/auditLog";
import {
  ensureAllStarVaultAccess,
  ensureAllStarVaultCanDeleteVoteSubmission,
} from "@/lib/allStar/auth";
import { isFrozenFirstTeamCycle } from "@/lib/allStar/cycleType";
import prisma from "@/lib/prisma";


export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });


  const cycleId = request.nextUrl.searchParams.get("cycleId")?.trim();
  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: { id: true },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const submissions = await prisma.allStarVoteSubmission.findMany({
    where: { ballotCycleId: cycleId },
    orderBy: { submittedAt: "desc" },
    include: {
      coachUser: {
        select: { id: true, email: true, firstName: true, lastName: true, name: true },
      },
      voteItems: {
        select: { id: true },
      },
    },
  });

  return NextResponse.json({
    data: submissions.map((submission) => ({
      id: submission.id,
      coachUserId: submission.coachUserId,
      submittedAt: submission.submittedAt,
      voteItemCount: submission.voteItems.length,
      coachUser: {
        id: submission.coachUser.id,
        email: submission.coachUser.email,
        firstName: submission.coachUser.firstName,
        lastName: submission.coachUser.lastName,
        name: submission.coachUser.name,
      },
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAllStarVaultCanDeleteVoteSubmission(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });


  const body = (await request.json()) as { submissionId?: string };
  const submissionId = body.submissionId?.trim();
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
  }

  const submission = await prisma.allStarVoteSubmission.findUnique({
    where: { id: submissionId },
    include: {
      ballotCycle: { select: { status: true, title: true } },
      coachUser: { select: { email: true, firstName: true, lastName: true, name: true } },
      voteItems: { select: { candidateId: true, rating: true } },
    },
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (isFrozenFirstTeamCycle(submission.ballotCycle)) {
    return NextResponse.json(
      { error: "First-team cycle is frozen while closed. Reopen cycle to edit." },
      { status: 409 },
    );
  }

  const coachLabel =
    submission.coachUser.firstName || submission.coachUser.lastName
      ? [submission.coachUser.firstName, submission.coachUser.lastName].filter(Boolean).join(" ")
      : submission.coachUser.name || submission.coachUser.email;

  const beforeState = {
    submission: {
      id: submission.id,
      ballotCycleId: submission.ballotCycleId,
      coachUserId: submission.coachUserId,
      phase: submission.phase,
      organizationId: submission.organizationId,
      ageGroup: submission.ageGroup,
      submittedAt: submission.submittedAt.toISOString(),
    },
    voteItems: submission.voteItems.map((item) => ({
      candidateId: item.candidateId,
      rating: item.rating,
    })),
  };

  await prisma.allStarVoteSubmission.delete({ where: { id: submissionId } });

  await recordAllStarAuditLog({
    organizationId: submission.organizationId,
    ballotCycleId: submission.ballotCycleId,
    entityType: "vote_submission",
    entityId: submissionId,
    action: "VOTE_SUBMISSION_DELETED",
    summary: `Deleted submitted ballot for ${coachLabel}`,
    beforeState,
    afterState: null,
    request,
  });

  return NextResponse.json({ success: true });
}
