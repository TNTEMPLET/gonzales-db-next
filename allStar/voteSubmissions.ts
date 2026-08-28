import type { Prisma, PrismaClient } from "@prisma/client";

type DbClient = Prisma.TransactionClient | PrismaClient;

export async function deleteVoteSubmissionsForCycleCoachEmail(
  db: DbClient,
  ballotCycleId: string,
  invitedEmail: string,
  organizationId: string,
) {
  const normalizedEmail = invitedEmail.trim().toLowerCase();
  if (!normalizedEmail) return 0;

  const coaches = await db.registeredUser.findMany({
    where: {
      email: { equals: normalizedEmail, mode: "insensitive" },
      orgProfiles: { some: { organizationId } },
    },
    select: { id: true },
  });
  if (coaches.length === 0) return 0;

  const result = await db.allStarVoteSubmission.deleteMany({
    where: {
      ballotCycleId,
      coachUserId: { in: coaches.map((coach) => coach.id) },
    },
  });
  return result.count;
}
