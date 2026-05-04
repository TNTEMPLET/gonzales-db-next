import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
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

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: { organizationId: true, ageGroup: true, seasonYear: true },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const coaches = await prisma.registeredUser.findMany({
    where: {
      organizationId: cycle.organizationId,
      isCoach: true,
      isBlocked: false,
      ageGroup: { equals: cycle.ageGroup, mode: "insensitive" },
    },
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      lastName: true,
      assignedTeam: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { email: "asc" }],
  });

  const assignmentRows =
    coaches.length === 0
      ? []
      : await prisma.teamCoachAssignment.findMany({
          where: {
            registeredUserId: { in: coaches.map((coach) => coach.id) },
            team: {
              organizationId: cycle.organizationId,
              ageGroup: cycle.ageGroup,
              seasonYear: cycle.seasonYear,
            },
          },
          select: {
            registeredUserId: true,
            role: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: "desc" }],
        });
  const roleByCoachId = new Map<string, "HEAD_COACH" | "ASSISTANT_COACH">();
  for (const row of assignmentRows) {
    if (roleByCoachId.has(row.registeredUserId)) continue;
    roleByCoachId.set(row.registeredUserId, row.role);
  }

  return NextResponse.json({
    data: coaches.map((coach) => ({
      ...coach,
      coachRole: roleByCoachId.get(coach.id) || null,
    })),
  });
}
