import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { buildSecondTeamCycleTitle, isSecondTeamCycleTitle } from "@/lib/allStar/cycleType";
import { computeVoteSummaryRows, getSecondTeamAutoExclusionCandidateIds } from "@/lib/allStar/voteSummary";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { cycleId?: string; action?: "generate" };
  if (!body.cycleId || !body.action) {
    return NextResponse.json({ error: "cycleId and action are required" }, { status: 400 });
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: body.cycleId },
    include: { candidates: true },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  if (isSecondTeamCycleTitle(cycle.title)) {
    return NextResponse.json({ error: "Selected cycle is already a second-team cycle" }, { status: 400 });
  }

  const secondTitle = buildSecondTeamCycleTitle(cycle.title);
  const existingSecondTeam = await prisma.allStarBallotCycle.findFirst({
    where: {
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      title: secondTitle,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existingSecondTeam) {
    return NextResponse.json({
      success: true,
      created: false,
      secondCycleId: existingSecondTeam.id,
      message: "Second-team cycle already exists",
    });
  }

  const firstTeam = await computeVoteSummaryRows(prisma, cycle.id);
  if (!firstTeam) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  const autoExcludedIds = getSecondTeamAutoExclusionCandidateIds(firstTeam.rows);

  const firstCycleInvites = await prisma.allStarInvite.findMany({
    where: { ballotCycleId: cycle.id },
    orderBy: { createdAt: "desc" },
  });

  const admin = await getAdminUserFromRequest(request);
  const created = await prisma.$transaction(async (tx) => {
    const secondCycle = await tx.allStarBallotCycle.create({
      data: {
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
        title: secondTitle,
        hasShowcase: cycle.hasShowcase,
        status: "DRAFT",
        accessMode: cycle.accessMode,
        createdByAdminId: admin?.id || null,
      },
    });

    const includedCandidates = cycle.candidates.filter(
      (candidate) => candidate.isActive && !autoExcludedIds.has(candidate.id),
    );
    for (const candidate of includedCandidates) {
      await tx.allStarCandidate.create({
        data: {
          ballotCycleId: secondCycle.id,
          organizationId: candidate.organizationId,
          ageGroup: candidate.ageGroup,
          playerFullName: candidate.playerFullName,
          team: candidate.team,
          jerseyNumber: candidate.jerseyNumber,
          showcaseBibNumber: candidate.showcaseBibNumber,
          isActive: candidate.isActive,
        },
      });
    }

    for (const invite of firstCycleInvites) {
      await tx.allStarInvite.create({
        data: {
          ballotCycleId: secondCycle.id,
          tokenHash: null,
          inviteToken: null,
          organizationId: invite.organizationId,
          ageGroup: invite.ageGroup,
          invitedEmail: invite.invitedEmail,
          invitedUserId: invite.invitedUserId,
          createdByAdminId: admin?.id || null,
          revokedAt: invite.revokedAt,
          expiresAt: invite.expiresAt,
        },
      });
    }
    return secondCycle;
  });

  return NextResponse.json({
    success: true,
    created: true,
    secondCycleId: created.id,
    includedCandidates: cycle.candidates.filter(
      (candidate) => candidate.isActive && !autoExcludedIds.has(candidate.id),
    ).length,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as {
    cycleId?: string;
    candidateId?: string;
    mode?: "include" | "exclude" | "clear";
  };
  if (!body.cycleId || !body.candidateId || !body.mode) {
    return NextResponse.json(
      { error: "cycleId, candidateId, and mode are required" },
      { status: 400 },
    );
  }
  const admin = await getAdminUserFromRequest(request);
  const update =
    body.mode === "clear"
      ? {
          excludedFromSecondPhase: false,
          secondPhaseOverrideReason: null,
          secondPhaseOverrideAt: null,
          secondPhaseOverrideByAdminId: null,
        }
      : body.mode === "include"
        ? {
            excludedFromSecondPhase: false,
            secondPhaseOverrideReason: "INCLUDE_OVERRIDE",
            secondPhaseOverrideAt: new Date(),
            secondPhaseOverrideByAdminId: admin?.id || null,
          }
        : {
            excludedFromSecondPhase: true,
            secondPhaseOverrideReason: "EXCLUDE_OVERRIDE",
            secondPhaseOverrideAt: new Date(),
            secondPhaseOverrideByAdminId: admin?.id || null,
          };

  const existing = await prisma.allStarCandidate.findUnique({
    where: { id: body.candidateId },
    select: { ballotCycleId: true },
  });
  if (!existing || existing.ballotCycleId !== body.cycleId) {
    return NextResponse.json({ error: "Candidate does not belong to cycle" }, { status: 400 });
  }
  await prisma.allStarCandidate.update({
    where: { id: body.candidateId },
    data: update,
  });
  return NextResponse.json({ success: true });
}
