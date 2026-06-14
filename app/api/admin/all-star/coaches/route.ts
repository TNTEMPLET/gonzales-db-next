import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";


export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: { organizationId: true, ageGroup: true, seasonYear: true },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  /**
   * Coaches are sourced from team assignments for this org/season/age group—not from
   * `RegisteredUser.ageGroup`, which only stores a single profile value and misses coaches
   * who are assigned to multiple divisions.
   */
  const assignmentRows = await prisma.teamCoachAssignment.findMany({
    where: {
      registeredUser: {
        organizationId: cycle.organizationId,
        isCoach: true,
        isBlocked: false,
      },
      team: {
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: { equals: cycle.ageGroup, mode: "insensitive" },
      },
    },
    include: {
      registeredUser: {
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          assignedTeam: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const mergedByCoachId = new Map<
    string,
    {
      coach: (typeof assignmentRows)[0]["registeredUser"];
      coachRole: "HEAD_COACH" | "ASSISTANT_COACH";
    }
  >();

  for (const row of assignmentRows) {
    const id = row.registeredUserId;
    const prev = mergedByCoachId.get(id);
    const coachRole: "HEAD_COACH" | "ASSISTANT_COACH" =
      row.role === "HEAD_COACH" || prev?.coachRole === "HEAD_COACH"
        ? "HEAD_COACH"
        : "ASSISTANT_COACH";
    if (!prev) {
      mergedByCoachId.set(id, { coach: row.registeredUser, coachRole });
    } else {
      mergedByCoachId.set(id, { coach: prev.coach, coachRole });
    }
  }

  const data = Array.from(mergedByCoachId.values()).map(({ coach, coachRole }) => ({
    ...coach,
    coachRole,
  }));

  data.sort((a, b) => {
    const ln = (a.lastName || "").localeCompare(b.lastName || "", undefined, { sensitivity: "base" });
    if (ln !== 0) return ln;
    const fn = (a.firstName || "").localeCompare(b.firstName || "", undefined, { sensitivity: "base" });
    if (fn !== 0) return fn;
    return (a.email || "").localeCompare(b.email || "", undefined, { sensitivity: "base" });
  });

  return NextResponse.json({ data });
}
