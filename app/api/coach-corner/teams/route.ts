import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await resolveCoachCornerActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seasonYearParam = request.nextUrl.searchParams.get("seasonYear");
  const parsedSeasonYear = seasonYearParam ? Number(seasonYearParam) : Number.NaN;
  const seasonFilter = Number.isFinite(parsedSeasonYear) ? parsedSeasonYear : undefined;

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
    actor: { isAdmin: actor.isAdmin, targetOrg: actor.targetOrg },
    data: teams,
  });
}
