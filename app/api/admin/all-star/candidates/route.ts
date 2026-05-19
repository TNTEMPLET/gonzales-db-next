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

  if (!cycleId || !playerFullName || !team) {
    return NextResponse.json(
      { error: "cycleId, playerFullName, and team are required" },
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

  const body = (await request.json()) as {
    cycleId?: string;
    candidateId?: string;
    candidateIds?: string[];
  };

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

  if (Array.isArray(body.candidateIds) && body.candidateIds.length > 0) {
    const ids = body.candidateIds.map((id) => String(id || "").trim()).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: "candidateIds are required" }, { status: 400 });
    }
    const rows = await prisma.allStarCandidate.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        ballotCycleId: true,
        ballotCycle: { select: { status: true, title: true } },
      },
    });
    if (rows.length === 0) {
      return NextResponse.json({ success: true, deleted: 0 });
    }
    const cycleIds = Array.from(new Set(rows.map((row) => row.ballotCycleId)));
    if (cycleIds.length !== 1) {
      return NextResponse.json(
        { error: "Bulk delete must target candidates from one cycle only" },
        { status: 400 },
      );
    }
    if (isFrozenFirstTeamCycle(rows[0].ballotCycle)) {
      return NextResponse.json(
        { error: "First-team cycle is frozen while closed. Reopen cycle to edit." },
        { status: 409 },
      );
    }
    const deleted = await prisma.$transaction(async (tx) => {
      const result = await tx.allStarCandidate.deleteMany({ where: { id: { in: ids } } });
      await resequenceCandidateBibNumbers(tx, cycleIds[0]);
      return result.count;
    });
    return NextResponse.json({ success: true, deleted });
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

export async function PATCH(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const body = (await request.json()) as
    | {
        mode?: "bulk-update";
        cycleId?: string;
        candidateIds?: string[];
        changes?: {
          team?: string;
          jerseyNumber?: string;
          isActive?: boolean;
          excludedFromSecondPhase?: boolean;
          secondPhaseOverrideReason?: string | null;
        };
      }
    | {
        mode?: "resequence-bibs";
        cycleId?: string;
      };

  if (body.mode === "resequence-bibs") {
    const cycleId = body.cycleId?.trim() || "";
    if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
    const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
    if (isFrozenFirstTeamCycle(cycle)) {
      return NextResponse.json(
        { error: "First-team cycle is frozen while closed. Reopen cycle to edit." },
        { status: 409 },
      );
    }
    await prisma.$transaction(async (tx) => {
      await resequenceCandidateBibNumbers(tx, cycle.id);
    });
    return NextResponse.json({ success: true });
  }

  if (body.mode === "bulk-update") {
    const cycleId = body.cycleId?.trim() || "";
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
    if (candidateIds.length === 0) {
      return NextResponse.json({ error: "candidateIds are required" }, { status: 400 });
    }
    const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
    if (isFrozenFirstTeamCycle(cycle)) {
      return NextResponse.json(
        { error: "First-team cycle is frozen while closed. Reopen cycle to edit." },
        { status: 409 },
      );
    }

    const rawChanges = body.changes && typeof body.changes === "object" ? body.changes : {};
    const data: Record<string, unknown> = {};
    if (typeof rawChanges.team === "string") data.team = rawChanges.team.trim();
    if (typeof rawChanges.jerseyNumber === "string") data.jerseyNumber = rawChanges.jerseyNumber.trim();
    if (typeof rawChanges.isActive === "boolean") data.isActive = rawChanges.isActive;
    if (typeof rawChanges.excludedFromSecondPhase === "boolean") {
      data.excludedFromSecondPhase = rawChanges.excludedFromSecondPhase;
    }
    if ("secondPhaseOverrideReason" in rawChanges) {
      const value = rawChanges.secondPhaseOverrideReason;
      if (typeof value === "string") {
        const trimmed = value.trim();
        data.secondPhaseOverrideReason = trimmed || null;
      } else if (value === null) {
        data.secondPhaseOverrideReason = null;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "At least one change is required" }, { status: 400 });
    }

    const updated = await prisma.allStarCandidate.updateMany({
      where: {
        ballotCycleId: cycle.id,
        id: { in: candidateIds },
      },
      data,
    });
    return NextResponse.json({ success: true, updated: updated.count });
  }

  return NextResponse.json({ error: "Unsupported mode" }, { status: 400 });
}
