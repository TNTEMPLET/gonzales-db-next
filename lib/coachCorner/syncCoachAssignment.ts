import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Whenever a coach gets assigned to a team -- via the draft (DraftTeam
 * headCoach/assistant, at setup time or materialized into a real Team) or
 * directly via a season Team's "Assign Coaches" flow -- their
 * RegisteredUserOrgProfile.ageGroup/assignedTeam must reflect it. Those two
 * fields are what requiresCoachSetup() (app/api/dugout/auth/google/route.ts)
 * checks to decide whether a coach can get past the "finish your profile"
 * wall on site login -- without this sync, a coach who was only ever
 * assigned through the draft (never through the coach CSV import, which is
 * the one path that already set these) is stuck there forever even though
 * they're genuinely assigned to a real team.
 */
export async function syncCoachTeamAssignment(
  db: DbClient,
  params: { registeredUserId: string; organizationId: string; ageGroup: string; assignedTeam: string },
): Promise<void> {
  await db.registeredUserOrgProfile.upsert({
    where: {
      registeredUserId_organizationId: {
        registeredUserId: params.registeredUserId,
        organizationId: params.organizationId,
      },
    },
    create: {
      registeredUserId: params.registeredUserId,
      organizationId: params.organizationId,
      isCoach: true,
      ageGroup: params.ageGroup,
      assignedTeam: params.assignedTeam,
    },
    update: {
      isCoach: true,
      ageGroup: params.ageGroup,
      assignedTeam: params.assignedTeam,
    },
  });
}
