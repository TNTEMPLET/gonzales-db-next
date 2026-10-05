import "server-only";

import { excludeRegistrationHistoryEnrollment } from "@/lib/enrollment/operationalEnrollment";
import prisma from "@/lib/prisma";

import { planStaleEnrollmentPrune, type PruneEnrollmentCandidate } from "./prunePlan";
import { lockSpringEnrollment } from "./springEnrollmentLock";

export { pruneWouldBeUnsafe } from "./prunePolicy";

export type PruneStaleEnrollmentsResult = {
  kept: number;
  matchingCount: number;
  deletedEnrollments: number;
  deletedTeamPlayers: number;
  skipped: string | null;
};

type PruneClient = Pick<typeof prisma, "enrollment" | "teamPlayer">;

export async function pruneStaleEnrollments(input: {
  organizationId: string;
  seasonYear: number;
  keepKeys: Set<string>;
}): Promise<PruneStaleEnrollmentsResult> {
  if (input.organizationId === "gonzales" || input.organizationId === "ascension") {
    return prisma.$transaction(async (tx) => {
      await lockSpringEnrollment(tx, input.seasonYear);
      return pruneStaleEnrollmentsWith(tx, input);
    });
  }
  return pruneStaleEnrollmentsWith(prisma, input);
}

async function pruneStaleEnrollmentsWith(
  db: PruneClient,
  input: {
    organizationId: string;
    seasonYear: number;
    keepKeys: Set<string>;
  },
): Promise<PruneStaleEnrollmentsResult> {
  const fetched = await db.enrollment.findMany({
    where: excludeRegistrationHistoryEnrollment({
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
    }),
    select: {
      id: true,
      fullName: true,
      birthDate: true,
      sportsConnectPlayerId: true,
      sportsConnectRowKey: true,
      importRun: { select: { reportKind: true } },
    },
  });
  const rows: PruneEnrollmentCandidate[] = fetched.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    birthDate: row.birthDate,
    sportsConnectPlayerId: row.sportsConnectPlayerId,
    sportsConnectRowKey: row.sportsConnectRowKey,
    reportKind: row.importRun?.reportKind ?? null,
  }));
  const plan = planStaleEnrollmentPrune(rows, input.keepKeys);
  if (plan.skipped || plan.staleIds.length === 0) {
    return {
      kept: plan.kept,
      matchingCount: plan.matchingCount,
      deletedEnrollments: 0,
      deletedTeamPlayers: 0,
      skipped: plan.skipped,
    };
  }

  let deletedTeamPlayers = 0;
  if (plan.stalePlayerIds.length) {
    const deleted = await db.teamPlayer.deleteMany({
      where: {
        sportsConnectPlayerId: { in: plan.stalePlayerIds },
        team: { organizationId: input.organizationId, seasonYear: input.seasonYear },
      },
    });
    deletedTeamPlayers += deleted.count;
  }
  for (const row of plan.staleNameDobs) {
    const deleted = await db.teamPlayer.deleteMany({
      where: {
        fullName: row.fullName,
        birthDate: row.birthDate,
        team: { organizationId: input.organizationId, seasonYear: input.seasonYear },
      },
    });
    deletedTeamPlayers += deleted.count;
  }

  const deletedEnrollments = await db.enrollment.deleteMany({
    where: { id: { in: plan.staleIds } },
  });

  return {
    kept: plan.kept,
    matchingCount: plan.matchingCount,
    deletedEnrollments: deletedEnrollments.count,
    deletedTeamPlayers,
    skipped: null,
  };
}
