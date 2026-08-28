import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DraftProtectionType, DraftType } from "@prisma/client";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { detectCoachPlayerMatches } from "@/lib/draft/coachPlayerMatcher";
import { draftApiError } from "@/lib/draft/apiError";
import type { CoachPairing, DraftLeaderOption } from "@/lib/draft/types";

export async function GET(req: NextRequest) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("org") || "fallball";
  const seasonYearParam = searchParams.get("seasonYear");
  const seasonYear = seasonYearParam ? parseInt(seasonYearParam, 10) : 2026;
  const isContextRequest = searchParams.get("context") === "true";
  const selectedAgeGroup = searchParams.get("ageGroup");

  if (isContextRequest) {
    try {
      const distinctAgeGroups = await prisma.team.findMany({
        where: { organizationId, seasonYear },
        select: { ageGroup: true },
        distinct: ["ageGroup"],
      });

      let ageGroups = distinctAgeGroups.map((d) => d.ageGroup).filter(Boolean);

      if (ageGroups.length === 0) {
        ageGroups = [
          "10 year-old",
          "9 year-old",
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

      // Fetch registered users for this org (for coach and draft leader assignment)
      const allUsers = await prisma.registeredUser.findMany({
        where: {
          orgProfiles: {
            some: {
              organizationId,
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
            select: { isCoach: true, ageGroup: true, assignedTeam: true },
          },
        },
        orderBy: { name: "asc" },
      });

      const availableCoaches = allUsers
        .filter((u) => u.orgProfiles.some((p) => p.isCoach))
        .map((c) => ({
          id: c.id,
          name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email,
          email: c.email,
          ageGroup: c.orgProfiles[0]?.ageGroup || null,
          assignedTeam: c.orgProfiles[0]?.assignedTeam || null,
        }));

      const availableDraftLeaders: DraftLeaderOption[] = allUsers.map((u) => ({
        id: u.id,
        name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
        email: u.email,
        isCoach: u.orgProfiles.some((p) => p.isCoach),
      }));

      const ageGroupToQuery = selectedAgeGroup || ageGroups[0] || "";
      let suggestedMatches: Awaited<ReturnType<typeof detectCoachPlayerMatches>> = [];
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
        availableDraftLeaders,
        suggestedMatches,
        registeredPlayerCount,
      });
    } catch (e) {
      return draftApiError("sessions.context", e);
    }
  }

  const sessions = await prisma.draftSession.findMany({
    where: { organizationId, seasonYear },
    include: {
      draftLeader: {
        select: { id: true, name: true, email: true },
      },
      teams: {
        orderBy: { draftOrder: "asc" },
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
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

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
      draftLeaderUserId = null,
      teamNames = [],
      pairings = [],
      seedFromRegisteredPlayers = true,
      players = [],
    }: {
      organizationId: string;
      seasonYear: number | string;
      ageGroup: string;
      name: string;
      draftType?: string;
      secondsPerPick?: number | string;
      totalRounds?: number | string;
      draftLeaderUserId?: string | null;
      teamNames?: string[];
      pairings?: CoachPairing[];
      seedFromRegisteredPlayers?: boolean;
      players?: Record<string, unknown>[];
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
          draftLeaderUserId: draftLeaderUserId || null,
          status: "SETUP",
        },
      });

      // 2. Create Draft Teams and assign coaches. A team can have both a
      // head coach and an assistant coach pairing, each with their own
      // protected pick, so collect every pairing assigned to a team rather
      // than just the first match.
      type CreatedTeam = Awaited<ReturnType<typeof tx.draftTeam.create>>;
      const createdTeams: { team: CreatedTeam; pairings: CoachPairing[] }[] = [];
      for (let i = 0; i < teamNames.length; i++) {
        const teamName = teamNames[i];
        const teamPairings = pairings.filter((p) => p.assignedTeamName === teamName);

        const headPairing = teamPairings.find((p) => p.role === "HEAD_COACH" || !p.role);
        const assistantPairing = teamPairings.find((p) => p.role === "ASSISTANT_COACH");

        const team = await tx.draftTeam.create({
          data: {
            draftSessionId: newSession.id,
            teamName,
            draftOrder: i + 1,
            headCoachUserId: headPairing?.coachUserId || null,
            assistantUserId: assistantPairing?.coachUserId || null,
          },
        });
        createdTeams.push({ team, pairings: teamPairings });
      }

      // 3. Create Coach Protections — one per pairing, not one per team
      for (const { team, pairings: teamPairings } of createdTeams) {
        for (const pairing of teamPairings) {
          if (pairing.playerName) {
            await tx.coachPlayerProtection.create({
              data: {
                draftSessionId: newSession.id,
                draftTeamId: team.id,
                registeredUserId: pairing.coachUserId || null,
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
      }

      // 4. Populate Player Pool
      if (players && players.length > 0) {
        await tx.draftPlayerPool.createMany({
          data: players.map((p) => ({
            draftSessionId: newSession.id,
            firstName: (p.firstName as string) || null,
            lastName: (p.lastName as string) || null,
            fullName: (p.fullName as string) || `${p.firstName || ""} ${p.lastName || ""}`.trim(),
            guardianEmail: (p.guardianEmail as string) || null,
            guardianPhone: (p.guardianPhone as string) || null,
            birthDate: p.birthDate ? new Date(p.birthDate as string) : null,
            evaluationScore: p.evaluationScore ? parseFloat(String(p.evaluationScore)) : null,
            pitcherRating: p.pitcherRating ? parseInt(String(p.pitcherRating), 10) : null,
            catcherRating: p.catcherRating ? parseInt(String(p.catcherRating), 10) : null,
            notes: (p.notes as string) || null,
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
  } catch (e) {
    return draftApiError("sessions.create", e);
  }
}
