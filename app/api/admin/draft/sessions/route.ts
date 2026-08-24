import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DraftType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId") || "gonzales";
  const seasonYear = searchParams.get("seasonYear")
    ? parseInt(searchParams.get("seasonYear")!, 10)
    : 2026;

  const sessions = await prisma.draftSession.findMany({
    where: { organizationId, seasonYear },
    include: {
      teams: {
        include: {
          headCoach: { select: { id: true, name: true, email: true } },
          assistantCoach: { select: { id: true, name: true, email: true } },
        },
      },
      _count: {
        select: { playerPool: true, picks: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      organizationId,
      seasonYear,
      ageGroup,
      name,
      draftType = "SNAKE",
      secondsPerPick = 120,
      totalRounds = 12,
      teamNames = [],
      coaches = [],
      players = [],
    } = body;

    if (!organizationId || !ageGroup || !name) {
      return NextResponse.json(
        { error: "Missing required fields: organizationId, ageGroup, name" },
        { status: 400 }
      );
    }

    const session = await prisma.$transaction(async (tx) => {
      // 1. Create Draft Session
      const newSession = await tx.draftSession.create({
        data: {
          organizationId,
          seasonYear: parseInt(String(seasonYear), 10),
          ageGroup,
          name,
          draftType: draftType as DraftType,
          secondsPerPick: parseInt(String(secondsPerPick), 10),
          totalRounds: parseInt(String(totalRounds), 10),
          status: "SETUP",
        },
      });

      // 2. Create Draft Teams
      const createdTeams = [];
      for (let i = 0; i < teamNames.length; i++) {
        const teamName = teamNames[i];
        const coachAssignment = coaches[i] || {};

        const team = await tx.draftTeam.create({
          data: {
            draftSessionId: newSession.id,
            teamName,
            draftOrder: i + 1,
            headCoachUserId: coachAssignment.headCoachUserId || null,
            assistantUserId: coachAssignment.assistantUserId || null,
          },
        });
        createdTeams.push(team);
      }

      // 3. Populate Player Pool
      if (players && players.length > 0) {
        await tx.draftPlayerPool.createMany({
          data: players.map((p: any) => ({
            draftSessionId: newSession.id,
            firstName: p.firstName || null,
            lastName: p.lastName || null,
            fullName: p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
            guardianEmail: p.guardianEmail || null,
            guardianPhone: p.guardianPhone || null,
            birthDate: p.birthDate ? new Date(p.birthDate) : null,
            evaluationScore: p.evaluationScore ? parseFloat(String(p.evaluationScore)) : null,
            notes: p.notes || null,
          })),
        });
      }

      return newSession;
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create draft session:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
