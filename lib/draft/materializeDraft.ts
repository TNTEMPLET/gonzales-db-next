import { assignJerseyNumbersForTeam } from "@/lib/admin/jerseyNumbers";
import { prisma } from "@/lib/prisma";
import type { ContentOrgId } from "@/lib/siteConfig";

/**
 * Materializes a completed draft session into official Teams, TeamPlayer, and TeamCoachAssignment records.
 */
export async function materializeDraftSession(draftSessionId: string) {
  const session = await prisma.draftSession.findUnique({
    where: { id: draftSessionId },
    include: {
      teams: {
        include: {
          picks: true,
          headCoach: true,
          assistantCoach: true,
        },
      },
      playerPool: true,
    },
  });

  if (!session) {
    throw new Error(`DraftSession not found: ${draftSessionId}`);
  }

  const organizationId = session.organizationId as ContentOrgId;
  const seasonYear = session.seasonYear;
  const ageGroup = session.ageGroup;

  return await prisma.$transaction(async (tx) => {
    const createdTeams = [];

    for (const draftTeam of session.teams) {
      // 1. Create or find the official Team record
      let team = await tx.team.findFirst({
        where: {
          organizationId,
          seasonYear,
          ageGroup,
          teamName: draftTeam.teamName,
        },
      });

      if (!team) {
        team = await tx.team.create({
          data: {
            organizationId,
            seasonYear,
            ageGroup,
            teamName: draftTeam.teamName,
            contactNotes: `Materialized from Draft Session: ${session.name}`,
          },
        });
      }

      createdTeams.push(team);

      // 2. Assign Head Coach
      if (draftTeam.headCoachUserId) {
        await tx.teamCoachAssignment.upsert({
          where: {
            teamId_registeredUserId: {
              teamId: team.id,
              registeredUserId: draftTeam.headCoachUserId,
            },
          },
          create: {
            teamId: team.id,
            registeredUserId: draftTeam.headCoachUserId,
            role: "HEAD_COACH",
          },
          update: {},
        });
      }

      // 3. Assign Assistant Coach
      if (draftTeam.assistantUserId) {
        await tx.teamCoachAssignment.upsert({
          where: {
            teamId_registeredUserId: {
              teamId: team.id,
              registeredUserId: draftTeam.assistantUserId,
            },
          },
          create: {
            teamId: team.id,
            registeredUserId: draftTeam.assistantUserId,
            role: "ASSISTANT_COACH",
          },
          update: {},
        });
      }

      // 4. Create TeamPlayer records for drafted players
      for (const pick of draftTeam.picks) {
        const poolPlayer = session.playerPool.find((p) => p.id === pick.playerPoolId);
        if (!poolPlayer) continue;

        // Check if player already exists on this team
        const existingPlayer = await tx.teamPlayer.findFirst({
          where: {
            teamId: team.id,
            fullName: poolPlayer.fullName,
          },
        });

        if (!existingPlayer) {
          await tx.teamPlayer.create({
            data: {
              teamId: team.id,
              firstName: poolPlayer.firstName,
              lastName: poolPlayer.lastName,
              fullName: poolPlayer.fullName,
              guardianEmail: poolPlayer.guardianEmail,
              guardianPhone: poolPlayer.guardianPhone,
              birthDate: poolPlayer.birthDate ? poolPlayer.birthDate.toISOString() : null,
              rosterStatus: "DRAFTED",
            },
          });
        }
      }

      // A finished draft is a finalized roster — number jerseys right away
      // instead of leaving it as a separate manual step per team. Jersey
      // size isn't captured in the draft pool today, so this falls back to
      // alphabetical-by-last-name until that's added; still gives every
      // drafted player a number.
      await assignJerseyNumbersForTeam(tx, team.id);
    }

    // 5. Update session status to MATERIALIZED
    const updatedSession = await tx.draftSession.update({
      where: { id: draftSessionId },
      data: { status: "MATERIALIZED" },
    });

    return {
      session: updatedSession,
      createdTeamsCount: createdTeams.length,
    };
  });
}
