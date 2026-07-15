import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import prisma from "@/lib/prisma";
import {
  EMPTY_AAT_SNAPSHOT,
  getAatSnapshotsByUserIds,
  type AatCertificateSnapshot,
} from "@/lib/volunteers/service";

export const dynamic = "force-dynamic";

const coachProfileSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  name: true,
  contactPhone: true,
} as const;

type CoachRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  contactPhone: string | null;
};

function withAat(
  coach: CoachRow | null,
  aatByUser: Map<string, AatCertificateSnapshot>,
) {
  if (!coach) return null;
  const aat = aatByUser.get(coach.id) ?? EMPTY_AAT_SNAPSHOT;
  return { ...coach, ...aat };
}

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

  const coachIds = new Set<string>();
  if (actorCoach) coachIds.add(actorCoach.id);
  for (const team of teams) {
    for (const assignment of team.coachAssignments) {
      coachIds.add(assignment.registeredUser.id);
    }
  }

  const aatByUser = await getAatSnapshotsByUserIds({
    organizationId: actor.targetOrg,
    registeredUserIds: [...coachIds],
    seasonYear: seasonFilter,
  });

  const data = teams.map((team) => ({
    ...team,
    coachAssignments: team.coachAssignments.map((assignment) => ({
      ...assignment,
      registeredUser: withAat(assignment.registeredUser, aatByUser)!,
    })),
  }));

  return NextResponse.json({
    actor: {
      isAdmin: actor.isAdmin,
      registeredUserId: actor.registeredUserId,
      targetOrg: actor.targetOrg,
      coach: withAat(actorCoach, aatByUser),
    },
    data,
  });
}
