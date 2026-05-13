import type { AllStarBallotPhase, PrismaClient } from "@prisma/client";

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
  activePhase: AllStarBallotPhase;
  parentBallotCycleId: string | null;
  runoffPoolSize: number | null;
  runoffFirstTeamSize: number | null;
};

/**
 * Same logic as GET `/api/admin/all-star/votes-summary`: vote count desc, avg rating desc, then name.
 */
export async function computeVoteSummaryRows(
  prisma: PrismaClient,
  cycleId: string,
  phase?: AllStarBallotPhase,
): Promise<{ rows: VoteSummaryRow[]; submissionCount: number; cycle: VoteSummaryCycleMeta } | null> {
  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    include: {
      candidates: {
        where: { isActive: true },
      },
    },
  });

  if (!cycle) return null;
  const voteSubmissions = await prisma.allStarVoteSubmission.findMany({
    where: {
      ballotCycleId: cycle.id,
      phase: phase ?? undefined,
    },
    include: { voteItems: true },
  });

  const ratingsByCandidate = new Map<string, number[]>();
  for (const submission of voteSubmissions) {
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
    submissionCount: voteSubmissions.length,
    cycle: {
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      hasShowcase: cycle.hasShowcase,
      title: cycle.title ?? null,
      activePhase: cycle.activePhase,
      parentBallotCycleId: cycle.parentBallotCycleId ?? null,
      runoffPoolSize: cycle.runoffPoolSize ?? null,
      runoffFirstTeamSize: cycle.runoffFirstTeamSize ?? null,
    },
  };
}

/** Strict top `count` by current standings order (no tie expansion). Used for remainder second-team exclusions. */
export function getTopVoteGetterCandidateIds(sortedRows: VoteSummaryRow[], count: number): Set<string> {
  if (count <= 0) return new Set();
  return new Set(sortedRows.slice(0, count).map((row) => row.candidateId));
}

export function getSecondTeamAutoExclusionCandidateIds(firstPhaseRows: VoteSummaryRow[]) {
  return getTopVoteGetterCandidateIds(firstPhaseRows, 12);
}

/**
 * Top `poolSize` rows plus any additional rows tied at the same vote count as the last included row
 * (same tie policy as {@link selectVoteSummaryNameOnlyPool} for a configurable cutoff index).
 */
export function expandVoteSummaryTopByVoteCountCutoff(sorted: VoteSummaryRow[], poolSize: number): VoteSummaryRow[] {
  if (sorted.length === 0 || poolSize <= 0) return [];
  if (sorted.length <= poolSize) return [...sorted];
  const lastIndex = poolSize - 1;
  const cutoffVotes = sorted[lastIndex]!.voteCount;
  let end = poolSize;
  while (end < sorted.length && sorted[end]!.voteCount === cutoffVotes) {
    end += 1;
  }
  return sorted.slice(0, end);
}

export function getRunoffPoolCandidateIds(sortedRows: VoteSummaryRow[], poolSize: number): Set<string> {
  return new Set(expandVoteSummaryTopByVoteCountCutoff(sortedRows, poolSize).map((row) => row.candidateId));
}

/** Split runoff standings into first team (top `firstTeamSize`) vs second team (remaining rows). */
export function splitVoteSummaryRowsForRunoff(
  rows: VoteSummaryRow[],
  firstTeamSize: number,
): { firstTeam: VoteSummaryRow[]; secondTeam: VoteSummaryRow[] } {
  if (firstTeamSize <= 0) return { firstTeam: [], secondTeam: rows };
  return {
    firstTeam: rows.slice(0, firstTeamSize),
    secondTeam: rows.slice(firstTeamSize),
  };
}

export function computeSecondTeamInclusion(
  candidates: Array<{
    id: string;
    isActive: boolean;
    excludedFromSecondPhase: boolean;
    secondPhaseOverrideReason: string | null;
  }>,
  autoExcludedIds: Set<string>,
) {
  return candidates.filter((candidate) => {
    if (!candidate.isActive) return false;
    if (candidate.secondPhaseOverrideReason === "INCLUDE_OVERRIDE") return true;
    if (
      candidate.excludedFromSecondPhase ||
      candidate.secondPhaseOverrideReason === "EXCLUDE_OVERRIDE"
    ) {
      return false;
    }
    if (autoExcludedIds.has(candidate.id)) return false;
    return true;
  });
}

export function getPlayerFirstLastName(playerFullName: string) {
  const parts = playerFullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return playerFullName.trim();
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function getPlayerLastNameForSort(playerFullName: string) {
  const normalized = playerFullName.trim();
  if (!normalized) return "";
  const parts = normalized.split(/\s+/);
  return parts[parts.length - 1] || normalized;
}

export function sortVoteSummaryRowsByLastName(rows: VoteSummaryRow[]) {
  return [...rows].sort((left, right) => {
    const lastNameCompare = getPlayerLastNameForSort(left.playerFullName).localeCompare(
      getPlayerLastNameForSort(right.playerFullName),
      undefined,
      { sensitivity: "base" },
    );
    if (lastNameCompare !== 0) return lastNameCompare;
    return left.playerFullName.localeCompare(right.playerFullName, undefined, {
      sensitivity: "base",
    });
  });
}

/** Same cutoff as the vault name-only snapshot: top 12 vote tier plus ties at the cutoff. */
export function selectVoteSummaryNameOnlyPool(sorted: VoteSummaryRow[]) {
  return expandVoteSummaryTopByVoteCountCutoff(sorted, 12);
}

export type NameOnlyRankRow = { rank: string; displayLine: string };

/** Public name-only export rows: no ranks, last-name order. */
export function buildNameOnlyVotePdfRows(sorted: VoteSummaryRow[]): NameOnlyRankRow[] {
  return sortVoteSummaryRowsByLastName(selectVoteSummaryNameOnlyPool(sorted)).map((row) => ({
    rank: "",
    displayLine: getPlayerFirstLastName(row.playerFullName),
  }));
}
