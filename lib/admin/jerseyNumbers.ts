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
