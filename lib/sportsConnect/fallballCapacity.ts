import "server-only";

import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";

/**
 * Division (Team.ageGroup) enrollment + matched-coach capacity for Fall Ball,
 * computed from the real Team/TeamPlayer/TeamCoachAssignment roster tables —
 * the same source getRosterQualitySummary() (./quality.ts) uses. There is no
 * separate "enrollment" data source: SportsConnect Drive-sync import runs
 * (SportsConnectImportRun) only ever store detection metadata (row/column
 * counts, confidence), never row-level roster data, so they can't answer
 * "how many players are enrolled per division" — only the roster tables can.
 */

export type FallBallDivisionCapacity = {
  divisionName: string;
  enrolledPlayers: number;
  teamCount: number;
  matchedCoaches: number;
  status: "DEFICIT" | "NEAR_CAPACITY" | "IDEAL" | "SURPLUS";
};

export type FallBallCapacityReport = {
  organizationId: "fallball";
  seasonYear: number;
  seasonLabel: string;
  generatedAt: string;
  totalPlayers: number;
  totalCoaches: number;
  totalTeams: number;
  divisions: FallBallDivisionCapacity[];
  /** Informational only — last time a PLAYER_REG file was detected via Drive sync, if any. */
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

export async function getFallBallCapacityReport(): Promise<FallBallCapacityReport> {
  const organizationId = "fallball" as const;
  const season = getSeasonConfigForOrg(organizationId);

  const teams = await prisma.team.findMany({
    where: { organizationId, seasonYear: season.year },
    select: {
      ageGroup: true,
      _count: { select: { players: true, coachAssignments: true } },
    },
  });

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

  const divisions: FallBallDivisionCapacity[] = Array.from(byDivision.entries())
    .map(([divisionName, stats]) => ({
      divisionName,
      enrolledPlayers: stats.playerCount,
      teamCount: stats.teamCount,
      matchedCoaches: stats.coachCount,
      status: statusForDivision(stats.teamCount, stats.coachCount),
    }))
    .sort((a, b) => a.divisionName.localeCompare(b.divisionName));

  const totalPlayers = divisions.reduce((sum, d) => sum + d.enrolledPlayers, 0);
  const totalCoaches = divisions.reduce((sum, d) => sum + d.matchedCoaches, 0);
  const totalTeams = divisions.reduce((sum, d) => sum + d.teamCount, 0);

  const lastPlayerRegSync = await prisma.sportsConnectImportRun.findFirst({
    where: { organizationId, reportKind: "PLAYER_REG", status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, sourceFileName: true },
  });

  return {
    organizationId,
    seasonYear: season.year,
    seasonLabel: season.label,
    generatedAt: new Date().toISOString(),
    totalPlayers,
    totalCoaches,
    totalTeams,
    divisions,
    lastPlayerRegSyncAt: lastPlayerRegSync?.createdAt.toISOString() ?? null,
    lastPlayerRegSyncFileName: lastPlayerRegSync?.sourceFileName ?? null,
  };
}
