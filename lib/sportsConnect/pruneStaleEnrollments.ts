import "server-only";

import prisma from "@/lib/prisma";
import { pruneWouldBeUnsafe } from "./prunePolicy";

export { pruneWouldBeUnsafe };

export type PruneStaleEnrollmentsResult = {
  kept: number;
  matchingCount: number;
  deletedEnrollments: number;
  deletedTeamPlayers: number;
  skipped: string | null;
};

function birthKey(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "nodob";
}

export async function pruneStaleEnrollments(input: {
  organizationId: string;
  seasonYear: number;
  keepKeys: Set<string>;
}): Promise<PruneStaleEnrollmentsResult> {
  const existing = await prisma.enrollment.findMany({
    where: { organizationId: input.organizationId, seasonYear: input.seasonYear },
    select: {
      id: true,
      fullName: true,
      birthDate: true,
      sportsConnectPlayerId: true,
      sportsConnectRowKey: true,
    },
  });
  const matching = existing.filter((row) => input.keepKeys.has(row.sportsConnectRowKey));
  const skipped = pruneWouldBeUnsafe({
    existingCount: existing.length,
    keepCount: input.keepKeys.size,
    matchingCount: matching.length,
  });
  if (skipped) {
    return {
      kept: existing.length,
      matchingCount: matching.length,
      deletedEnrollments: 0,
      deletedTeamPlayers: 0,
      skipped,
    };
  }

  const stale = existing.filter((row) => !input.keepKeys.has(row.sportsConnectRowKey));
  if (!stale.length) {
    return {
      kept: matching.length,
      matchingCount: matching.length,
      deletedEnrollments: 0,
      deletedTeamPlayers: 0,
      skipped: null,
    };
  }

  const keptPlayerIds = new Set(
    matching.map((row) => row.sportsConnectPlayerId).filter((id): id is string => Boolean(id)),
  );
  const keptNameDobs = new Set(matching.map((row) => `${row.fullName}::${birthKey(row.birthDate)}`));
  const stalePlayerIds = [
    ...new Set(
      stale
        .map((row) => row.sportsConnectPlayerId)
        .filter((id): id is string => Boolean(id) && !keptPlayerIds.has(id)),
    ),
  ];

  let deletedTeamPlayers = 0;
  if (stalePlayerIds.length) {
    const deleted = await prisma.teamPlayer.deleteMany({
      where: {
        sportsConnectPlayerId: { in: stalePlayerIds },
        team: { organizationId: input.organizationId, seasonYear: input.seasonYear },
      },
    });
    deletedTeamPlayers += deleted.count;
  }
  for (const row of stale) {
    if (row.sportsConnectPlayerId) continue;
    if (keptNameDobs.has(`${row.fullName}::${birthKey(row.birthDate)}`)) continue;
    const deleted = await prisma.teamPlayer.deleteMany({
      where: {
        fullName: row.fullName,
        birthDate: row.birthDate,
        team: { organizationId: input.organizationId, seasonYear: input.seasonYear },
      },
    });
    deletedTeamPlayers += deleted.count;
  }

  const deletedEnrollments = await prisma.enrollment.deleteMany({
    where: { id: { in: stale.map((row) => row.id) } },
  });

  return {
    kept: matching.length,
    matchingCount: matching.length,
    deletedEnrollments: deletedEnrollments.count,
    deletedTeamPlayers,
    skipped: null,
  };
}
