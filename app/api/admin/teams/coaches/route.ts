import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const teamId = request.nextUrl.searchParams.get("teamId")?.trim();
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, organizationId: true },
  });
  if (!team || team.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const assignments = await prisma.teamCoachAssignment.findMany({
    where: { teamId: team.id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: {
      registeredUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          name: true,
          contactPhone: true,
          ageGroup: true,
          assignedTeam: true,
        },
      },
    },
  });

  return NextResponse.json({ data: assignments });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as {
    teamId?: string;
    registeredUserId?: string;
    role?: "HEAD_COACH" | "ASSISTANT_COACH";
  };
  if (!body.teamId || !body.registeredUserId) {
    return NextResponse.json(
      { error: "teamId and registeredUserId are required" },
      { status: 400 },
    );
  }

  const [team, coach] = await Promise.all([
    prisma.team.findUnique({
      where: { id: body.teamId },
      select: { id: true, organizationId: true },
    }),
    prisma.registeredUser.findUnique({
      where: { id: body.registeredUserId },
      select: { id: true, organizationId: true, isCoach: true, isBlocked: true },
    }),
  ]);
  if (!team || team.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  if (!coach || coach.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Coach account not found" }, { status: 404 });
  }
  if (!coach.isCoach || coach.isBlocked) {
    return NextResponse.json(
      { error: "User must be an active coach to assign." },
      { status: 400 },
    );
  }

  const assignment = await prisma.teamCoachAssignment.upsert({
    where: {
      teamId_registeredUserId: {
        teamId: team.id,
        registeredUserId: coach.id,
      },
    },
    create: {
      teamId: team.id,
      registeredUserId: coach.id,
      role: body.role || "ASSISTANT_COACH",
    },
    update: {
      role: body.role || "ASSISTANT_COACH",
    },
    include: {
      registeredUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          name: true,
          contactPhone: true,
          ageGroup: true,
          assignedTeam: true,
        },
      },
    },
  });

  return NextResponse.json({ success: true, assignment });
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const body = (await request.json()) as { assignmentId?: string };
  if (!body.assignmentId) {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  const assignment = await prisma.teamCoachAssignment.findUnique({
    where: { id: body.assignmentId },
    include: { team: { select: { organizationId: true } } },
  });
  if (!assignment || assignment.team.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  await prisma.teamCoachAssignment.delete({ where: { id: assignment.id } });
  return NextResponse.json({ success: true });
}
