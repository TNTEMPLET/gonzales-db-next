import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const coachProfileSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  name: true,
  contactPhone: true,
  abuseAwarenessTrainingCertificateUrl: true,
  abuseAwarenessTrainingCertificateFileName: true,
  abuseAwarenessTrainingCertificateMimeType: true,
  abuseAwarenessTrainingCertificateUploadedAt: true,
} as const;

export async function GET(request: NextRequest) {
  const actor = await resolveCoachCornerActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seasonYearParam = request.nextUrl.searchParams.get("seasonYear");
  const parsedSeasonYear = seasonYearParam ? Number(seasonYearParam) : Number.NaN;
  const seasonFilter = Number.isFinite(parsedSeasonYear) ? parsedSeasonYear : undefined;

  const actorCoach = await prisma.registeredUser.findFirst({
    where: {
      id: actor.registeredUserId,
      organizationId: actor.targetOrg,
      isCoach: true,
      isBlocked: false,
    },
    select: coachProfileSelect,
  });

  const teams = actor.isAdmin
    ? await prisma.team.findMany({
        where: {
          organizationId: actor.targetOrg,
          seasonYear: seasonFilter,
        },
        orderBy: [{ seasonYear: "desc" }, { ageGroup: "asc" }, { teamName: "asc" }],
        include: {
          coachAssignments: {
            include: {
              registeredUser: {
                select: coachProfileSelect,
              },
            },
          },
          players: {
            orderBy: [{ fullName: "asc" }],
          },
          _count: {
            select: { players: true, coachAssignments: true },
          },
        },
      })
    : await prisma.team.findMany({
        where: {
          organizationId: actor.targetOrg,
          seasonYear: seasonFilter,
          coachAssignments: { some: { registeredUserId: actor.registeredUserId } },
        },
        orderBy: [{ seasonYear: "desc" }, { ageGroup: "asc" }, { teamName: "asc" }],
        include: {
          coachAssignments: {
            include: {
              registeredUser: {
                select: coachProfileSelect,
              },
            },
          },
          players: {
            orderBy: [{ fullName: "asc" }],
          },
          _count: {
            select: { players: true, coachAssignments: true },
          },
        },
      });

  return NextResponse.json({
    actor: {
      isAdmin: actor.isAdmin,
      registeredUserId: actor.registeredUserId,
      targetOrg: actor.targetOrg,
      coach: actorCoach,
    },
    data: teams,
  });
}
