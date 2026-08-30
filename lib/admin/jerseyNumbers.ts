import type { Prisma, PrismaClient } from "@prisma/client";

import { sortPlayersBySize, type UnmatchedJerseySize } from "@/lib/admin/jerseySizes";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Reassigns jersey numbers for every player on one team, starting at 1,
 * ordered smallest jersey size to largest (the league's usual convention),
 * tie-broken by last name. This replaces any existing numbers on the team —
 * it's a full renumber, not a fill-in-the-blanks pass.
 *
 * Takes a Prisma client/transaction client so it can run standalone (the
 * manual "Auto-Number Jerseys" button) or inside an existing transaction
 * (draft materialization) without a second implementation drifting apart.
 */
export async function assignJerseyNumbersForTeam(
  db: DbClient,
  teamId: string,
): Promise<{ assigned: number; unmatchedSizes: UnmatchedJerseySize[] } | null> {
  const players = await db.teamPlayer.findMany({
    where: { teamId },
    select: { id: true, fullName: true, lastName: true, jerseySize: true },
  });
  if (players.length === 0) return null;

  const { sorted, unmatched } = sortPlayersBySize(players);

  for (let index = 0; index < sorted.length; index++) {
    await db.teamPlayer.update({
      where: { id: sorted[index].id },
      data: { jerseyNumber: String(index + 1) },
    });
  }

  return { assigned: sorted.length, unmatchedSizes: unmatched };
}

export type FinalizeDivisionResult = {
  teamsNumbered: number;
  totalAssigned: number;
  unmatchedSizes: UnmatchedJerseySize[];
};

/**
 * Numbers every team in a division, but only if the whole division has
 * resolved to real teams — if any team is still the "Unallocated" catch-all
 * (SportsConnect hasn't assigned real teams for every player yet), does
 * nothing and returns null. Used both by the explicit "Finalize & Number
 * Division" button and automatically at the end of a player import, so a
 * division that becomes fully real as of this import gets numbered right
 * away without a separate manual step.
 */
export async function finalizeDivisionIfReady(
  db: DbClient,
  params: { organizationId: string; seasonYear: number; ageGroup: string },
): Promise<FinalizeDivisionResult | null> {
  const teams = await db.team.findMany({
    where: {
      organizationId: params.organizationId,
      seasonYear: params.seasonYear,
      ageGroup: params.ageGroup,
    },
    select: { id: true, teamName: true },
  });
  if (teams.length === 0) return null;
  if (teams.some((t) => t.teamName.trim().toLowerCase() === "unallocated")) return null;

  let teamsNumbered = 0;
  let totalAssigned = 0;
  const unmatchedSizes: UnmatchedJerseySize[] = [];
  for (const team of teams) {
    const result = await assignJerseyNumbersForTeam(db, team.id);
    if (!result) continue;
    teamsNumbered += 1;
    totalAssigned += result.assigned;
    unmatchedSizes.push(...result.unmatchedSizes);
  }
  return { teamsNumbered, totalAssigned, unmatchedSizes };
}
