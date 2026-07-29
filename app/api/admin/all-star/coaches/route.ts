import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";

const coachSelect = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  assignedTeam: true,
  abuseAwarenessTrainingCertificateUrl: true,
  abuseAwarenessTrainingCertificateFileName: true,
  abuseAwarenessTrainingCertificateMimeType: true,
  abuseAwarenessTrainingCertificateUploadedAt: true,
} as const;

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
   * Prefer team assignments for role accuracy, then merge in active coach profiles
   * for the cycle age group so coaches can be managed before teams are built.
   */
  // Global identity model: RegisteredUser has no organizationId/isCoach/ageGroup.
  // Assignments are scoped by the team. "Coach profile" presence + age is on RegisteredUserOrgProfile.
  const [assignmentRows, orgProfiles] = await Promise.all([
    prisma.teamCoachAssignment.findMany({
      where: {
        team: {
          organizationId: cycle.organizationId,
          seasonYear: cycle.seasonYear,
          ageGroup: { equals: cycle.ageGroup, mode: "insensitive" },
        },
      },
      include: {
        registeredUser: {
          select: coachSelect,
        },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    (prisma as any).registeredUserOrgProfile.findMany({
      where: {
        organizationId: cycle.organizationId,
        isCoach: true,
        ageGroup: { equals: cycle.ageGroup, mode: "insensitive" },
        registeredUser: { isBlocked: false },
      },
      include: {
        registeredUser: {
          select: coachSelect,
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
  ]);

  const mergedByCoachId = new Map<
    string,
    {
      coach: any;
      coachRole: "HEAD_COACH" | "ASSISTANT_COACH" | null;
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

  for (const p of orgProfiles) {
    const coach = p.registeredUser;
    if (!coach) continue;
    if (!mergedByCoachId.has(coach.id)) {
      mergedByCoachId.set(coach.id, { coach, coachRole: null });
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
