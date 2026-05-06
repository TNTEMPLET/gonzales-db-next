import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess, ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resequenceCandidateBibNumbers } from "@/lib/allStar/candidates";
import { isFrozenFirstTeamCycle } from "@/lib/allStar/cycleType";
import prisma from "@/lib/prisma";

function forbidIfNotMaster() {
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const data = await prisma.allStarCandidate.findMany({
    where: { ballotCycleId: cycleId },
    orderBy: [{ showcaseBibNumber: "asc" }, { playerFullName: "asc" }],
  });

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const body = (await request.json()) as {
    cycleId?: string;
    playerFullName?: string;
    team?: string;
    jerseyNumber?: string;
  };
  const cycleId = body.cycleId?.trim() || "";
  const playerFullName = body.playerFullName?.trim() || "";
  const team = body.team?.trim() || "";
  const jerseyNumber = body.jerseyNumber?.trim() || "";

  if (!cycleId || !playerFullName || !team || !jerseyNumber) {
    return NextResponse.json(
      { error: "cycleId, playerFullName, team, and jerseyNumber are required" },
      { status: 400 },
    );
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  if (isFrozenFirstTeamCycle(cycle)) {
    return NextResponse.json(
      { error: "First-team cycle is frozen while closed. Reopen cycle to edit." },
      { status: 409 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const candidate = await tx.allStarCandidate.create({
      data: {
        ballotCycleId: cycle.id,
        organizationId: cycle.organizationId,
        ageGroup: cycle.ageGroup,
        playerFullName,
        team,
        jerseyNumber,
        showcaseBibNumber: null,
      },
    });
    await resequenceCandidateBibNumbers(tx, cycle.id);
    return tx.allStarCandidate.findUnique({ where: { id: candidate.id } });
  });

  return NextResponse.json({ success: true, candidate: created });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const body = (await request.json()) as { cycleId?: string; candidateId?: string };

  if (body.candidateId) {
    const candidate = await prisma.allStarCandidate.findUnique({
      where: { id: body.candidateId },
      select: {
        ballotCycleId: true,
        ballotCycle: { select: { status: true, title: true } },
      },
    });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (isFrozenFirstTeamCycle(candidate.ballotCycle)) {
      return NextResponse.json(
        { error: "First-team cycle is frozen while closed. Reopen cycle to edit." },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.allStarCandidate.delete({ where: { id: body.candidateId } });
      await resequenceCandidateBibNumbers(tx, candidate.ballotCycleId);
    });
    return NextResponse.json({ success: true, deleted: 1 });
  }

  if (!body.cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: body.cycleId },
    select: { status: true, title: true },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  if (isFrozenFirstTeamCycle(cycle)) {
    return NextResponse.json(
      { error: "First-team cycle is frozen while closed. Reopen cycle to edit." },
      { status: 409 },
    );
  }

  const deleted = await prisma.allStarCandidate.deleteMany({
    where: { ballotCycleId: body.cycleId },
  });
  return NextResponse.json({ success: true, deleted: deleted.count });
}
