import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DraftProtectionType, DraftType } from "@prisma/client";

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
          protections: true,
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
      pairings = [],
      seedFromRegisteredPlayers = true,
      players = [],
    } = body;

    if (!organizationId || !ageGroup || !name) {
      return NextResponse.json(
        { error: "Missing required fields: organizationId, ageGroup, name" },
        { status: 400 }
      );
    }

    const parsedSeasonYear = parseInt(String(seasonYear), 10);

    const session = await prisma.$transaction(async (tx) => {
      // 1. Create Draft Session
      const newSession = await tx.draftSession.create({
        data: {
          organizationId,
          seasonYear: parsedSeasonYear,
          ageGroup,
          name,
          draftType: draftType as DraftType,
          secondsPerPick: parseInt(String(secondsPerPick), 10),
          totalRounds: parseInt(String(totalRounds), 10),
          status: "SETUP",
        },
      });

      // 2. Create Draft Teams and assign coaches
      const createdTeams = [];
      for (let i = 0; i < teamNames.length; i++) {
        const teamName = teamNames[i];
        
        // Find matching pairing for this team (by teamName or by index)
        const teamPairing =
          pairings.find(
            (p: any) =>
              p.assignedTeamName === teamName ||
              p.teamIndex === i ||
              (!p.assignedTeamName && p.teamIndex === undefined && pairings.indexOf(p) === i)
          ) || coaches[i] || {};

        const headCoachId =
          teamPairing.role === "HEAD_COACH" || !teamPairing.role
            ? teamPairing.coachUserId || teamPairing.headCoachUserId || null
            : null;
        const assistantId =
          teamPairing.role === "ASSISTANT_COACH"
            ? teamPairing.coachUserId || teamPairing.assistantUserId || null
            : teamPairing.assistantUserId || null;

        const team = await tx.draftTeam.create({
          data: {
            draftSessionId: newSession.id,
            teamName,
            draftOrder: i + 1,
            headCoachUserId: headCoachId,
            assistantUserId: assistantId,
          },
        });
        createdTeams.push({ team, pairing: teamPairing });
      }

      // 3. Create Coach Protections
      for (const { team, pairing } of createdTeams) {
        if (pairing && pairing.playerName) {
          await tx.coachPlayerProtection.create({
            data: {
              draftSessionId: newSession.id,
              draftTeamId: team.id,
              registeredUserId: pairing.coachUserId || pairing.headCoachUserId || null,
              playerName: pairing.playerName,
              guardianEmail: pairing.guardianEmail || null,
              protectionType:
                pairing.role === "ASSISTANT_COACH"
                  ? DraftProtectionType.ASSISTANT_COACH_CHILD
                  : DraftProtectionType.HEAD_COACH_CHILD,
              protectedRound: pairing.protectedRound ? parseInt(String(pairing.protectedRound), 10) : 1,
              isClaimed: false,
            },
          });
        }
      }

      // 4. Populate Player Pool
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
      } else if (seedFromRegisteredPlayers) {
        // Query registered players for this age group and season
        const registeredPlayers = await tx.teamPlayer.findMany({
          where: {
            team: {
              organizationId,
              seasonYear: parsedSeasonYear,
              ageGroup,
            },
          },
          select: {
            firstName: true,
            lastName: true,
            fullName: true,
            guardianEmail: true,
            guardianPhone: true,
            birthDate: true,
          },
        });

        if (registeredPlayers.length > 0) {
          await tx.draftPlayerPool.createMany({
            data: registeredPlayers.map((p) => ({
              draftSessionId: newSession.id,
              firstName: p.firstName || null,
              lastName: p.lastName || null,
              fullName: p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
              guardianEmail: p.guardianEmail || null,
              guardianPhone: p.guardianPhone || null,
              birthDate: p.birthDate ? new Date(p.birthDate) : null,
            })),
          });
        }
      }

      return newSession;
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create draft session:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
