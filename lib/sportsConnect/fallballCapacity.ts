import "server-only";

import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";

/**
 * Division (Team.ageGroup) enrollment + matched-coach capacity for Fall Ball.
 *
 * Two eras of data:
 * - Pre-team-formation (before any Team rows exist for the season): only an
 *   org-wide player total and a coach total are meaningful — there's no real
 *   per-division split available yet, since SportsConnectImportRun only ever
 *   stores detection metadata (row/column counts, confidence), never
 *   row-level roster data with a division per row.
 * - Post-team-formation (once Team rows exist): real per-division numbers
 *   from Team/TeamPlayer/TeamCoachAssignment, the same source
 *   getRosterQualitySummary() (./quality.ts) uses.
 *
 * playerDataSource on the report tells the caller which era's numbers it's
 * looking at — never silently present one as if it were the other.
 */

const FALLBALL_ORG = "fallball" as const;

/**
 * Last-resort player total for when no SportsConnectImportRun has ever
 * recorded a PLAYER_REG row count for this org (e.g. before the very first
 * Drive sync or manual detect has run). This is a manually-recorded snapshot,
 * not live data — always surfaced as playerDataSource: "manual_fallback" so
 * nothing displays it as current/live without saying so.
 */
const MANUAL_FALLBACK_PLAYER_TOTAL = 831;

export type FallBallDivisionCapacity = {
  divisionName: string;
  enrolledPlayers: number;
  teamCount: number;
  matchedCoaches: number;
  status: "DEFICIT" | "NEAR_CAPACITY" | "IDEAL" | "SURPLUS";
};

export type FallBallPlayerDataSource =
  | "team_rosters"
  | "sports_connect_sync"
  | "manual_fallback"
  | "none";

export type FallBallCapacityReport = {
  organizationId: "fallball";
  seasonYear: number;
  seasonLabel: string;
  generatedAt: string;
  teamsFormed: boolean;
  totalPlayers: number;
  totalCoaches: number;
  totalTeams: number;
  /** Only populated once Team rows exist — no fabricated per-division split before then. */
  divisions: FallBallDivisionCapacity[];
  playerDataSource: FallBallPlayerDataSource;
  lastPlayerRegSyncAt: string | null;
  lastPlayerRegSyncFileName: string | null;
};

function statusForDivision(teamCount: number, coachCount: number): FallBallDivisionCapacity["status"] {
  if (teamCount === 0) return "IDEAL"; // no teams formed yet — nothing to staff
  if (coachCount === 0) return "DEFICIT";
  if (coachCount < teamCount) return "NEAR_CAPACITY";
  if (coachCount > teamCount * 2) return "SURPLUS";
  return "IDEAL";
}

function readRowCount(summary: unknown): number | null {
  if (!summary || typeof summary !== "object") return null;
  const value = (summary as Record<string, unknown>).rowCount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function getFallBallCapacityReport(): Promise<FallBallCapacityReport> {
  const organizationId = FALLBALL_ORG;
  const season = getSeasonConfigForOrg(organizationId);

  const [teams, convertedCoaches, lastPlayerRun] = await Promise.all([
    prisma.team.findMany({
      where: { organizationId, seasonYear: season.year },
      select: {
        ageGroup: true,
        _count: { select: { players: true, coachAssignments: true } },
      },
    }),
    prisma.coachingInterestSubmission.count({
      where: { organizationId, status: "CONVERTED" },
    }),
    prisma.sportsConnectImportRun.findFirst({
      where: { organizationId, reportKind: "PLAYER_REG", status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, sourceFileName: true, summary: true },
    }),
  ]);

  const teamsFormed = teams.length > 0;

  let divisions: FallBallDivisionCapacity[] = [];
  let totalPlayers = 0;
  let totalTeams = 0;
  let playerDataSource: FallBallPlayerDataSource;

  if (teamsFormed) {
    const byDivision = new Map<
      string,
      { teamCount: number; playerCount: number; coachCount: number }
    >();
    for (const team of teams) {
      const entry = byDivision.get(team.ageGroup) ?? {
        teamCount: 0,
        playerCount: 0,
        coachCount: 0,
      };
      entry.teamCount += 1;
      entry.playerCount += team._count.players;
      entry.coachCount += team._count.coachAssignments;
      byDivision.set(team.ageGroup, entry);
    }

    divisions = Array.from(byDivision.entries())
      .map(([divisionName, stats]) => ({
        divisionName,
        enrolledPlayers: stats.playerCount,
        teamCount: stats.teamCount,
        matchedCoaches: stats.coachCount,
        status: statusForDivision(stats.teamCount, stats.coachCount),
      }))
      .sort((a, b) => a.divisionName.localeCompare(b.divisionName));

    totalPlayers = divisions.reduce((sum, d) => sum + d.enrolledPlayers, 0);
    totalTeams = divisions.reduce((sum, d) => sum + d.teamCount, 0);
    playerDataSource = "team_rosters";
  } else {
    const syncedRowCount = readRowCount(lastPlayerRun?.summary);
    if (syncedRowCount !== null) {
      totalPlayers = syncedRowCount;
      playerDataSource = "sports_connect_sync";
    } else {
      totalPlayers = MANUAL_FALLBACK_PLAYER_TOTAL;
      playerDataSource = "manual_fallback";
    }
  }

  return {
    organizationId,
    seasonYear: season.year,
    seasonLabel: season.label,
    generatedAt: new Date().toISOString(),
    teamsFormed,
    totalPlayers,
    totalCoaches: convertedCoaches,
    totalTeams,
    divisions,
    playerDataSource,
    lastPlayerRegSyncAt: lastPlayerRun?.createdAt.toISOString() ?? null,
    lastPlayerRegSyncFileName: lastPlayerRun?.sourceFileName ?? null,
  };
}
