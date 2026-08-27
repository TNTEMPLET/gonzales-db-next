import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectCoachPlayerMatches } from "@/lib/draft/coachPlayerMatcher";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId") || "fallball";
    const seasonYear = searchParams.get("seasonYear")
      ? parseInt(searchParams.get("seasonYear")!, 10)
      : 2026;
    const selectedAgeGroup = searchParams.get("ageGroup") || "";

    // 1. Fetch active age groups from existing teams or fall back
    const existingTeams = await prisma.team.findMany({
      where: { organizationId, seasonYear },
      select: { ageGroup: true },
      distinct: ["ageGroup"],
      orderBy: { ageGroup: "asc" },
    });

    let ageGroups = existingTeams.map((t) => t.ageGroup).filter(Boolean);
    if (ageGroups.length === 0) {
      ageGroups = [
        "9 year-old",
        "10 year-old",
        "11-12 year-olds",
        "13-15 year-olds",
        "15-17 year-olds",
        "Coaches' Pitch 7 year-olds",
        "Coaches' Pitch 8 year-olds",
        "Modified Tee Ball, 6 year-olds",
        "Tee Ball, 3-4 year-olds",
        "Tee Ball, 5 year-olds",
      ];
    }

    // 2. Fetch available registered coaches
    const coaches = await prisma.registeredUser.findMany({
      where: {
        orgProfiles: {
          some: {
            organizationId,
            isCoach: true,
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        orgProfiles: {
          where: { organizationId },
          select: { ageGroup: true, assignedTeam: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const availableCoaches = coaches.map((c) => ({
      id: c.id,
      name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email,
      email: c.email,
      ageGroup: c.orgProfiles[0]?.ageGroup || null,
      assignedTeam: c.orgProfiles[0]?.assignedTeam || null,
    }));

    // 3. If ageGroup specified, detect matches and count players
    const ageGroupToQuery = selectedAgeGroup || ageGroups[0] || "";

    let suggestedMatches: any[] = [];
    let registeredPlayerCount = 0;

    if (ageGroupToQuery) {
      suggestedMatches = await detectCoachPlayerMatches(
        organizationId,
        ageGroupToQuery,
        seasonYear
      );

      registeredPlayerCount = await prisma.teamPlayer.count({
        where: {
          team: {
            organizationId,
            seasonYear,
            ageGroup: ageGroupToQuery,
          },
        },
      });
    }

    return NextResponse.json({
      ageGroups,
      availableCoaches,
      suggestedMatches,
      registeredPlayerCount,
    });
  } catch (error: any) {
    console.error("Draft setup context error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
