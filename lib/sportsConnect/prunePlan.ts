import { PLAYER_REG_HISTORY_REPORT_KIND } from "./registrationHistoryKind";
import { pruneWouldBeUnsafe } from "./prunePolicy";

export type PruneEnrollmentCandidate = {
  id: string;
  fullName: string;
  birthDate: Date | null;
  sportsConnectPlayerId: string | null;
  sportsConnectRowKey: string;
  /** Null when the row has no import run. History runs are not prune input. */
  reportKind: string | null;
};

function birthKey(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "nodob";
}

export function isOperationalEnrollmentCandidate(row: {
  reportKind: string | null;
}): boolean {
  return row.reportKind !== PLAYER_REG_HISTORY_REPORT_KIND;
}

export type StaleEnrollmentPlan = {
  kept: number;
  matchingCount: number;
  skipped: string | null;
  staleIds: string[];
  stalePlayerIds: string[];
  staleNameDobs: Array<{ fullName: string; birthDate: Date | null }>;
};

/**
 * History rows are removed before the keep/stale split, so they are neither
 * "existing" roster registrations nor a reason to delete TeamPlayer rows.
 */
export function planStaleEnrollmentPrune(
  rows: PruneEnrollmentCandidate[],
  keepKeys: Set<string>,
): StaleEnrollmentPlan {
  const existing = rows.filter(isOperationalEnrollmentCandidate);
  const matching = existing.filter((row) => keepKeys.has(row.sportsConnectRowKey));
  const skipped = pruneWouldBeUnsafe({
    existingCount: existing.length,
    keepCount: keepKeys.size,
    matchingCount: matching.length,
  });
  if (skipped) {
    return {
      kept: existing.length,
      matchingCount: matching.length,
      skipped,
      staleIds: [],
      stalePlayerIds: [],
      staleNameDobs: [],
    };
  }

  const stale = existing.filter((row) => !keepKeys.has(row.sportsConnectRowKey));
  if (!stale.length) {
    return {
      kept: matching.length,
      matchingCount: matching.length,
      skipped: null,
      staleIds: [],
      stalePlayerIds: [],
      staleNameDobs: [],
    };
  }

  const keptPlayerIds = new Set(
    matching.map((row) => row.sportsConnectPlayerId).filter((id): id is string => Boolean(id)),
  );
  const keptNameDobs = new Set(
    matching.map((row) => `${row.fullName}::${birthKey(row.birthDate)}`),
  );
  const stalePlayerIds = [
    ...new Set(
      stale
        .map((row) => row.sportsConnectPlayerId)
        .filter((id): id is string => Boolean(id))
        .filter((id) => !keptPlayerIds.has(id)),
    ),
  ];
  const staleNameDobs = stale
    .filter((row) => !row.sportsConnectPlayerId)
    .filter((row) => !keptNameDobs.has(`${row.fullName}::${birthKey(row.birthDate)}`))
    .map((row) => ({ fullName: row.fullName, birthDate: row.birthDate }));

  return {
    kept: matching.length,
    matchingCount: matching.length,
    skipped: null,
    staleIds: stale.map((row) => row.id),
    stalePlayerIds,
    staleNameDobs,
  };
}
