import type { AllStarBallotPhase, PrismaClient } from "@prisma/client";

/** Matches All-Star Votes Panel ordering; non-runoff ballots list only candidates with ≥1 rating. */
export type VoteSummaryRow = {
  candidateId: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
  showcaseBibNumber: string | null;
  finalRosterOverride: "SELECTED" | "REMOVED" | "SECOND_TEAM" | null;
  finalRosterOverrideReason: string | null;
  voteCount: number;
  averageRating: number;
};

export type VoteSummaryCycleMeta = {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  allStarAgeGroupLabel: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  publishedAt: string | null;
  closedAt: string | null;
  hasShowcase: boolean;
  title: string | null;
  activePhase: AllStarBallotPhase;
  parentBallotCycleId: string | null;
  runoffPoolSize: number | null;
  runoffFirstTeamSize: number | null;
  runoffIsFinalVote: boolean;
  runoffTeamTarget: AllStarBallotPhase | null;
  runoffPlayersNeeded: number | null;
};

export const DEFAULT_VOTE_EXPORT_TOP_COUNT = 12;
export const MAX_VOTE_EXPORT_TOP_COUNT = 200;

export function parseVoteExportTopCount(value: string | null | undefined) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_VOTE_EXPORT_TOP_COUNT;
  return Math.min(MAX_VOTE_EXPORT_TOP_COUNT, Math.max(1, parsed));
}

export function isAllStarRunoffTwoTeamBallot(cycle: {
  runoffFirstTeamSize?: number | null;
  runoffPoolSize?: number | null;
}) {
  return (
    cycle.runoffFirstTeamSize != null &&
    cycle.runoffFirstTeamSize > 0 &&
    cycle.runoffPoolSize != null
  );
}

export type VotePanelPdfTeam = "primary" | "secondary";

export function parseVotePanelPdfTeamParam(
  value: string | null | undefined,
): VotePanelPdfTeam | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === "primary" || raw === "1" || raw === "first") return "primary";
  if (raw === "secondary" || raw === "2" || raw === "second") return "secondary";
  return null;
}

/**
 * Same logic as GET `/api/admin/all-star/votes-summary`: vote count desc, avg rating desc, then name.
 * Runoff cycles include the full candidate pool (zero-vote rows sort last) so first/second team splits match roster size.
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

  const sortVoteSummary = (a: VoteSummaryRow, b: VoteSummaryRow) => {
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    if (b.averageRating !== a.averageRating) return b.averageRating - a.averageRating;
    return a.playerFullName.localeCompare(b.playerFullName);
  };

  const allRows = cycle.candidates
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
        finalRosterOverride: candidate.finalRosterOverride ?? null,
        finalRosterOverrideReason: candidate.finalRosterOverrideReason ?? null,
        voteCount,
        averageRating: Number(averageRating.toFixed(3)),
      };
    })
    .sort(sortVoteSummary);

  const isRunoffCycle =
    cycle.runoffFirstTeamSize != null && cycle.runoffPoolSize != null;

  /** Runoff ballots often rate only M of N players; still show full pool split with zero-vote rows at the bottom. */
  const rows = isRunoffCycle ? allRows : allRows.filter((row) => row.voteCount > 0);

  return {
    rows,
    submissionCount: voteSubmissions.length,
    cycle: {
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      allStarAgeGroupLabel: cycle.allStarAgeGroupLabel ?? null,
      status: cycle.status,
      publishedAt: cycle.publishedAt?.toISOString() ?? null,
      closedAt: cycle.closedAt?.toISOString() ?? null,
      hasShowcase: cycle.hasShowcase,
      title: cycle.title ?? null,
      activePhase: cycle.activePhase,
      parentBallotCycleId: cycle.parentBallotCycleId ?? null,
      runoffPoolSize: cycle.runoffPoolSize ?? null,
      runoffFirstTeamSize: cycle.runoffFirstTeamSize ?? null,
      runoffIsFinalVote: cycle.runoffIsFinalVote,
      runoffTeamTarget: cycle.runoffTeamTarget ?? null,
      runoffPlayersNeeded: cycle.runoffPlayersNeeded ?? null,
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

export function getSecondTeamAutoExclusionCandidateIdsForCount(
  firstPhaseRows: VoteSummaryRow[],
  count = DEFAULT_VOTE_EXPORT_TOP_COUNT,
) {
  return getTopVoteGetterCandidateIds(firstPhaseRows, count);
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
  const selectedIds = new Set<string>();

  // Step 1 — natural top-N by vote rank, excluding REMOVED and SECOND_TEAM players.
  // SECOND_TEAM means "keep on the final roster but force to the second team."
  for (const row of rows.slice(0, firstTeamSize)) {
    if (row.finalRosterOverride !== "REMOVED" && row.finalRosterOverride !== "SECOND_TEAM") {
      selectedIds.add(row.candidateId);
    }
  }

  // Step 2 — fill any gaps in the top-N left by REMOVED or SECOND_TEAM players.
  //   • SECOND_TEAM gaps: auto-fill from the next natural rank (the "displaced" player
  //     should simply be replaced by whoever was just outside the cutoff).
  //   • REMOVED gaps: only fill with explicit SELECTED overrides from below the cutoff
  //     (the admin chose a specific replacement).
  // We never exceed firstTeamSize regardless of how many SELECTED overrides exist below.
  if (selectedIds.size < firstTeamSize) {
    const topN = rows.slice(0, firstTeamSize);
    const secondTeamGaps = topN.filter(r => r.finalRosterOverride === "SECOND_TEAM").length;
    const removedGaps = topN.filter(r => r.finalRosterOverride === "REMOVED").length;

    let secondTeamFilled = 0;
    let removedFilled = 0;

    for (const row of rows.slice(firstTeamSize)) {
      if (secondTeamFilled >= secondTeamGaps && removedFilled >= removedGaps) break;
      if (selectedIds.has(row.candidateId)) continue;
      if (row.finalRosterOverride === "REMOVED" || row.finalRosterOverride === "SECOND_TEAM") continue;

      // Fill SECOND_TEAM gaps first — any eligible rank order works.
      if (secondTeamFilled < secondTeamGaps) {
        selectedIds.add(row.candidateId);
        secondTeamFilled++;
      }
      // Fill REMOVED gaps only with an explicit SELECTED override.
      else if (row.finalRosterOverride === "SELECTED" && removedFilled < removedGaps) {
        selectedIds.add(row.candidateId);
        removedFilled++;
      }
    }
  }

  // Step 3 — safety: ensure no REMOVED or SECOND_TEAM player leaked into firstTeam.
  for (const row of rows) {
    if (row.finalRosterOverride === "REMOVED" || row.finalRosterOverride === "SECOND_TEAM") {
      selectedIds.delete(row.candidateId);
    }
  }

  return {
    firstTeam: rows.filter((row) => selectedIds.has(row.candidateId)),
    secondTeam: rows.filter((row) => !selectedIds.has(row.candidateId)),
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

/** Same cutoff as the vault name-only snapshot: top vote tier plus ties at the cutoff. */
export function selectVoteSummaryTopVoteGetterPool(
  sorted: VoteSummaryRow[],
  count = DEFAULT_VOTE_EXPORT_TOP_COUNT,
) {
  return expandVoteSummaryTopByVoteCountCutoff(sorted, count);
}

export function selectVoteSummaryNameOnlyPool(
  sorted: VoteSummaryRow[],
  count = DEFAULT_VOTE_EXPORT_TOP_COUNT,
) {
  return selectVoteSummaryTopVoteGetterPool(sorted, count);
}

export type NameOnlyRankRow = { rank: string; displayLine: string };

/** Public name-only export rows: no ranks, last-name order. */
export function buildNameOnlyVotePdfRows(
  sorted: VoteSummaryRow[],
  count = DEFAULT_VOTE_EXPORT_TOP_COUNT,
): NameOnlyRankRow[] {
  return sortVoteSummaryRowsByLastName(selectVoteSummaryNameOnlyPool(sorted, count)).map((row) => ({
    rank: "",
    displayLine: getPlayerFirstLastName(row.playerFullName),
  }));
}
