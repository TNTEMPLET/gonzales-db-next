import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";

function forbidIfNotMaster() {
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

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
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

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

  const coach = await prisma.registeredUser.findUnique({
    where: { id: body.registeredUserId },
    select: {
      id: true,
      organizationId: true,
      ageGroup: true,
      isCoach: true,
      isBlocked: true,
      email: true,
      firstName: true,
      lastName: true,
      name: true,
    },
  });
  if (!coach) return NextResponse.json({ error: "Coach not found" }, { status: 404 });
  if (
    !coach.isCoach ||
    coach.isBlocked ||
    coach.organizationId !== cycle.organizationId ||
    (coach.ageGroup || "").trim().toLowerCase() !==
      cycle.ageGroup.trim().toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Selected coach is not eligible for this cycle" },
      { status: 400 },
    );
  }

  const existing = await prisma.allStarHeadCoachAssignment.findFirst({
    where: {
      ballotCycleId: cycle.id,
      registeredUserId: coach.id,
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
      registeredUserId: coach.id,
      adminUserId: admin?.id || null,
      coachName:
        [coach.firstName, coach.lastName].filter(Boolean).join(" ") ||
        coach.name ||
        null,
      coachEmail: coach.email,
    },
  });

  return NextResponse.json({ success: true, assignment: created });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const body = (await request.json()) as { assignmentId?: string };
  if (!body.assignmentId) return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });

  await prisma.allStarHeadCoachAssignment.delete({ where: { id: body.assignmentId } });
  return NextResponse.json({ success: true });
}
