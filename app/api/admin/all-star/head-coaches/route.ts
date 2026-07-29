import { NextRequest, NextResponse } from "next/server";

import { recordAllStarAuditLog } from "@/lib/allStar/auditLog";
import { ensureAllStarVaultAccess, ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";


export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const data = await prisma.allStarHeadCoachAssignment.findMany({
    where: { ballotCycleId: cycleId },
    include: { registeredUser: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as {
    cycleId?: string;
    registeredUserId?: string;
  };
  if (!body.cycleId || !body.registeredUserId) {
    return NextResponse.json(
      { error: "cycleId and registeredUserId are required" },
      { status: 400 },
    );
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: body.cycleId } });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  // Global identity: RegisteredUser has no organizationId/isCoach/ageGroup.
  // Look up the global row, then the per-org profile for eligibility.
  const globalCoach = await prisma.registeredUser.findUnique({
    where: { id: body.registeredUserId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      name: true,
      isBlocked: true,
    },
  });
  if (!globalCoach) return NextResponse.json({ error: "Coach not found" }, { status: 404 });

  const profile = await (prisma as any).registeredUserOrgProfile.findUnique({
    where: {
      registeredUserId_organizationId: {
        registeredUserId: globalCoach.id,
        organizationId: cycle.organizationId,
      },
    },
    select: { isCoach: true, ageGroup: true },
  });

  const isCoachForOrg = !!profile?.isCoach;
  const ageGroupForOrg = profile?.ageGroup || null;

  if (
    !isCoachForOrg ||
    globalCoach.isBlocked ||
    (ageGroupForOrg || "").trim().toLowerCase() !== cycle.ageGroup.trim().toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Selected coach is not eligible for this cycle" },
      { status: 400 },
    );
  }

  const existing = await prisma.allStarHeadCoachAssignment.findFirst({
    where: {
      ballotCycleId: cycle.id,
      registeredUserId: globalCoach.id,
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Coach is already assigned for this cycle" },
      { status: 409 },
    );
  }

  const admin = await getAdminUserFromRequest(request);
  const created = await prisma.allStarHeadCoachAssignment.create({
    data: {
      ballotCycleId: cycle.id,
      organizationId: cycle.organizationId,
      ageGroup: cycle.ageGroup,
      registeredUserId: globalCoach.id,
      adminUserId: admin?.id || null,
      coachName:
        [globalCoach.firstName, globalCoach.lastName].filter(Boolean).join(" ") ||
        globalCoach.name ||
        null,
      coachEmail: globalCoach.email,
    },
  });

  const coachLabel =
    created.coachName || created.coachEmail || "coach";

  await recordAllStarAuditLog({
    organizationId: cycle.organizationId,
    ballotCycleId: cycle.id,
    entityType: "head_coach",
    entityId: created.id,
    action: "HEAD_COACH_ADDED",
    summary: `Assigned head coach ${coachLabel}`,
    beforeState: null,
    afterState: {
      id: created.id,
      ballotCycleId: created.ballotCycleId,
      registeredUserId: created.registeredUserId,
    },
    request,
  });

  return NextResponse.json({ success: true, assignment: created });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as { assignmentId?: string };
  if (!body.assignmentId) return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });

  const existing = await prisma.allStarHeadCoachAssignment.findUnique({
    where: { id: body.assignmentId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  await prisma.allStarHeadCoachAssignment.delete({ where: { id: body.assignmentId } });

  await recordAllStarAuditLog({
    organizationId: existing.organizationId,
    ballotCycleId: existing.ballotCycleId,
    entityType: "head_coach",
    entityId: existing.id,
    action: "HEAD_COACH_REMOVED",
    summary: `Removed head coach ${existing.coachName || existing.coachEmail || "assignment"}`,
    beforeState: {
      id: existing.id,
      ballotCycleId: existing.ballotCycleId,
      organizationId: existing.organizationId,
      ageGroup: existing.ageGroup,
      registeredUserId: existing.registeredUserId,
      adminUserId: existing.adminUserId,
      coachName: existing.coachName,
      coachEmail: existing.coachEmail,
    },
    afterState: null,
    request,
  });

  return NextResponse.json({ success: true });
}
