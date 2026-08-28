import prisma from "@/lib/prisma";

export function normalizeBallotEmail(email: string) {
  return email.trim().toLowerCase();
}

async function getAgeGroupCoachIdsForCycle(cycle: {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
}) {
  // Global identity: coaches for an org/age are determined by OrgProfile (isCoach + ageGroup) + team assignments.
  const [profileRows, assignmentRows] = await Promise.all([
    (prisma as any).registeredUserOrgProfile.findMany({
      where: {
        organizationId: cycle.organizationId,
        isCoach: true,
        ageGroup: { equals: cycle.ageGroup, mode: "insensitive" },
        registeredUser: { isBlocked: false },
      },
      select: { registeredUserId: true },
    }),
    prisma.teamCoachAssignment.findMany({
      where: {
        team: {
          organizationId: cycle.organizationId,
          seasonYear: cycle.seasonYear,
          ageGroup: { equals: cycle.ageGroup, mode: "insensitive" },
        },
      },
      select: { registeredUserId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const p of profileRows) ids.add(p.registeredUserId);
  for (const a of assignmentRows) ids.add(a.registeredUserId);
  return ids;
}

/**
 * True when every coach on the ballot roster has submitted (and roster is non-empty).
 * Mirrors client `ballotRosterStatus` in AllStarVaultManager.
 */
export async function areAllBallotsSubmittedForCycle(cycleId: string): Promise<boolean> {
  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: {
      accessMode: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
    },
  });
  if (!cycle) return false;

  const submissions = await prisma.allStarVoteSubmission.findMany({
    where: { ballotCycleId: cycleId },
    select: {
      coachUserId: true,
      coachUser: { select: { email: true } },
    },
  });

  const submittedByUserId = new Set(submissions.map((s) => s.coachUserId));
  const submittedEmails = new Set(
    submissions.map((s) => normalizeBallotEmail(s.coachUser.email)),
  );

  if (cycle.accessMode === "INVITE_LIST") {
    const activeInvites = await prisma.allStarInvite.findMany({
      where: { ballotCycleId: cycleId, revokedAt: null },
      select: { invitedUserId: true, invitedEmail: true },
    });

    if (activeInvites.length === 0) return false;

    for (const invite of activeInvites) {
      const uid = invite.invitedUserId;
      const didSubmit =
        (uid != null && submittedByUserId.has(uid)) ||
        submittedEmails.has(normalizeBallotEmail(invite.invitedEmail));
      if (!didSubmit) return false;
    }
    return true;
  }

  const coachIds = await getAgeGroupCoachIdsForCycle(cycle);
  if (coachIds.size === 0) return false;

  for (const coachId of coachIds) {
    if (!submittedByUserId.has(coachId)) return false;
  }
  return true;
}
