import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { syncCoachTeamAssignment } from "@/lib/coachCorner/syncCoachAssignment";

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

  // Global identity: per-org coach state (ageGroup/assignedTeam) lives on the OrgProfile.
  // We enrich the response with effective profile values below.
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
        },
      },
    },
  });

  // Attach effective per-org values from the profile for this org (for UI/display).
  const assignmentsWithProfile = await Promise.all(
    assignments.map(async (a: any) => {
      const prof = await (prisma as any).registeredUserOrgProfile.findUnique({
        where: {
          registeredUserId_organizationId: { registeredUserId: a.registeredUserId, organizationId: targetOrg },
        },
        select: { ageGroup: true, assignedTeam: true, isCoach: true },
      });
      return {
        ...a,
        registeredUser: {
          ...a.registeredUser,
          ageGroup: prof?.ageGroup ?? null,
          assignedTeam: prof?.assignedTeam ?? null,
          isCoach: prof?.isCoach ?? false,
        },
      };
    }),
  );

  return NextResponse.json({ data: assignmentsWithProfile });
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

  const [team, globalCoach] = await Promise.all([
    prisma.team.findUnique({
      where: { id: body.teamId },
      select: { id: true, organizationId: true, ageGroup: true, teamName: true },
    }),
    prisma.registeredUser.findUnique({
      where: { id: body.registeredUserId },
      select: { id: true, isBlocked: true },
    }),
  ]);
  if (!team || team.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  if (!globalCoach) {
    return NextResponse.json({ error: "Coach account not found" }, { status: 404 });
  }

  // Global identity: presence + coach flag for this org is in the profile.
  const profile = await (prisma as any).registeredUserOrgProfile.findUnique({
    where: {
      registeredUserId_organizationId: { registeredUserId: globalCoach.id, organizationId: targetOrg },
    },
    select: { isCoach: true },
  });
  if (!profile || !profile.isCoach || globalCoach.isBlocked) {
    return NextResponse.json(
      { error: "User must be an active coach to assign." },
      { status: 400 },
    );
  }

  const assignment = await prisma.teamCoachAssignment.upsert({
    where: {
      teamId_registeredUserId: {
        teamId: team.id,
        registeredUserId: globalCoach.id,
      },
    },
    create: {
      teamId: team.id,
      registeredUserId: globalCoach.id,
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
        },
      },
    },
  });

  await syncCoachTeamAssignment(prisma, {
    registeredUserId: globalCoach.id,
    organizationId: team.organizationId,
    ageGroup: team.ageGroup,
    assignedTeam: team.teamName,
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
