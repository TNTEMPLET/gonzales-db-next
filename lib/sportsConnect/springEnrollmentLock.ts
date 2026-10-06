/**
 * Cross-org Spring enrollment writes share one transaction lock per season.
 * The key is a different hash from the division-ages lock.
 */

import { createHash } from "node:crypto";

import { isSpringProgramName, isSpringSplitOrg } from "./divisionLeagueSplit";

export function springEnrollmentLockKey(seasonYear: number): bigint {
  const digest = createHash("sha256").update(`spring-enrollment:${Math.trunc(seasonYear)}`).digest();
  return BigInt.asIntN(64, digest.readBigUInt64BE(0));
}

type LockClient = {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

export async function lockSpringEnrollment(tx: LockClient, seasonYear: number): Promise<void> {
  const key = springEnrollmentLockKey(seasonYear);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
}

type SeasonMapping = {
  action: string;
  programName?: string;
  organizationId?: string;
  seasonYear?: number;
};

/** Season years whose Gonzales/Ascension Spring writes must take the shared lock. */
export function springEnrollmentSeasonYears(mapping: readonly SeasonMapping[]): number[] {
  const years = new Set<number>();
  for (const entry of mapping) {
    if (typeof entry.seasonYear !== "number") continue;
    if (entry.action === "split") {
      years.add(entry.seasonYear);
      continue;
    }
    if (
      entry.action === "map" &&
      isSpringSplitOrg(entry.organizationId) &&
      isSpringProgramName(entry.programName ?? "")
    ) {
      years.add(entry.seasonYear);
    }
  }
  return [...years].sort((a, b) => a - b);
}
