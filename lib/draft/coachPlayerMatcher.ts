import { prisma } from "@/lib/prisma";

export type CoachPlayerMatchCandidate = {
  coachUserId: string;
  coachName: string;
  coachEmail: string;
  playerName: string;
  guardianEmail: string | null;
  ageGroup: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  matchReason: string;
};

/**
 * Scans coaches and player registrations for an organization and age group,
 * identifying guardian-child relationships to pre-link coaches to players.
 */
export async function detectCoachPlayerMatches(
  organizationId: string,
  ageGroup: string
): Promise<CoachPlayerMatchCandidate[]> {
  // Fetch registered coaches for the organization
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
    },
  });

  if (coaches.length === 0) {
    return [];
  }

  // Fetch coaching interest submissions as additional coach signal
  const interestSubmissions = await prisma.coachingInterestSubmission.findMany({
    where: {
      organizationId,
    },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      interestedDivision: true,
    },
  });

  const candidates: CoachPlayerMatchCandidate[] = [];

  for (const coach of coaches) {
    const coachEmailClean = coach.email.trim().toLowerCase();
    const coachLastNameClean = (coach.lastName || "").trim().toLowerCase();

    // Look in DraftPlayerPool if a draft session already exists
    const poolPlayers = await prisma.draftPlayerPool.findMany({
      where: {
        draftSession: {
          organizationId,
          ageGroup,
        },
      },
      select: {
        fullName: true,
        firstName: true,
        lastName: true,
        guardianEmail: true,
      },
    });

    for (const player of poolPlayers) {
      const guardianEmailClean = (player.guardianEmail || "").trim().toLowerCase();
      const playerLastNameClean = (player.lastName || "").trim().toLowerCase();

      let matched = false;
      let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
      let matchReason = "";

      if (guardianEmailClean && guardianEmailClean === coachEmailClean) {
        matched = true;
        confidence = "HIGH";
        matchReason = "Guardian email matches registered coach email";
      } else if (
        coachLastNameClean.length > 2 &&
        playerLastNameClean === coachLastNameClean
      ) {
        matched = true;
        confidence = "MEDIUM";
        matchReason = "Last name match between coach and registered player";
      }

      if (matched) {
        candidates.push({
          coachUserId: coach.id,
          coachName: coach.name || `${coach.firstName || ""} ${coach.lastName || ""}`.trim() || coach.email,
          coachEmail: coach.email,
          playerName: player.fullName,
          guardianEmail: player.guardianEmail,
          ageGroup,
          confidence,
          matchReason,
        });
      }
    }
  }

  return candidates;
}
