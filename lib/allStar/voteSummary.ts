import type { PrismaClient } from "@prisma/client";

/** Matches All-Star Votes Panel ordering and filters (active candidates with ≥1 rating only). */
export type VoteSummaryRow = {
  candidateId: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
  showcaseBibNumber: string | null;
  voteCount: number;
  averageRating: number;
};

export type VoteSummaryCycleMeta = {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  hasShowcase: boolean;
  title: string | null;
};

/**
 * Same logic as GET `/api/admin/all-star/votes-summary`: vote count desc, avg rating desc, then name.
 */
export async function computeVoteSummaryRows(
  prisma: PrismaClient,
  cycleId: string,
): Promise<{ rows: VoteSummaryRow[]; submissionCount: number; cycle: VoteSummaryCycleMeta } | null> {
  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    include: {
      candidates: {
        where: { isActive: true },
      },
      voteSubmissions: {
        include: { voteItems: true },
      },
    },
  });

  if (!cycle) return null;

  const ratingsByCandidate = new Map<string, number[]>();
  for (const submission of cycle.voteSubmissions) {
    for (const item of submission.voteItems) {
      const bucket = ratingsByCandidate.get(item.candidateId) || [];
      bucket.push(item.rating);
      ratingsByCandidate.set(item.candidateId, bucket);
    }
  }

  const rows = cycle.candidates
    .map((candidate) => {
      const ratings = ratingsByCandidate.get(candidate.id) || [];
      const voteCount = ratings.length;
      const averageRating = voteCount
        ? ratings.reduce((sum, value) => sum + value, 0) / voteCount
        : 0;
      return {
        candidateId: candidate.id,
        playerFullName: candidate.playerFullName,
        team: candidate.team,
        jerseyNumber: candidate.jerseyNumber,
        showcaseBibNumber: candidate.showcaseBibNumber,
        voteCount,
        averageRating: Number(averageRating.toFixed(3)),
      };
    })
    .filter((row) => row.voteCount > 0)
    .sort((a, b) => {
      if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
      if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
      return a.playerFullName.localeCompare(b.playerFullName);
    });

  return {
    rows,
    submissionCount: cycle.voteSubmissions.length,
    cycle: {
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      hasShowcase: cycle.hasShowcase,
      title: cycle.title ?? null,
    },
  };
}

export type NameOnlyRankRow = { rank: string; displayLine: string };

/**
 * PDF “Name only”: ranks 1–11 as name-only; rank 12 is everyone tied at the same vote count as the 12th
 * sorted player (index 11). If multiple players share rank 12, append avg rating next to each name; all labeled #12.
 */
export function buildNameOnlyVotePdfRows(sorted: VoteSummaryRow[]): NameOnlyRankRow[] {
  const out: NameOnlyRankRow[] = [];
  const n = sorted.length;
  if (n === 0) return out;

  const rankOneThroughElevenCount = Math.min(11, n);
  for (let i = 0; i < rankOneThroughElevenCount; i++) {
    const rank = i + 1;
    out.push({
      rank: String(rank),
      displayLine: sorted[i]!.playerFullName,
    });
  }

  if (n <= 11) return out;

  const thresholdVotes = sorted[11]!.voteCount;
  const rank12Group = sorted.filter((_, idx) => idx >= 11 && sorted[idx]!.voteCount === thresholdVotes);
  const tieAtTwelve = rank12Group.length > 1;

  for (const row of rank12Group) {
    const displayLine = tieAtTwelve
      ? `${row.playerFullName} (avg ${row.averageRating.toFixed(2)})`
      : row.playerFullName;
    out.push({
      rank: "12",
      displayLine,
    });
  }

  return out;
}
