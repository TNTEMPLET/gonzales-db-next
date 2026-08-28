import type {
  VolunteerReadiness,
  VolunteerRequirementKey,
  VolunteerRequirementStatusValue,
} from "./types";

export type RequirementStatusInput = {
  requirementKey: VolunteerRequirementKey;
  status: VolunteerRequirementStatusValue;
  required?: boolean;
};

const DEFAULT_REQUIRED: VolunteerRequirementKey[] = ["JDP", "ABUSE_AWARENESS"];

/**
 * Compute card readiness from requirement rows.
 * READY = every required item is CLEAR or WAIVED (and none EXPIRED/FAILED).
 */
export function computeVolunteerReadiness(
  rows: RequirementStatusInput[],
  requiredKeys: VolunteerRequirementKey[] = DEFAULT_REQUIRED,
  now: Date = new Date(),
): VolunteerReadiness {
  const byKey = new Map(rows.map((r) => [r.requirementKey, r]));

  let hasExpired = false;
  let hasBlocked = false;
  let hasIncomplete = false;

  for (const key of requiredKeys) {
    const row = byKey.get(key);
    const status = row?.status ?? "NOT_STARTED";

    if (status === "EXPIRED") {
      hasExpired = true;
      continue;
    }
    if (status === "FAILED") {
      hasBlocked = true;
      continue;
    }
    if (status === "CLEAR" || status === "WAIVED") {
      continue;
    }
    // NOT_STARTED | PENDING
    hasIncomplete = true;
  }

  // If a CLEAR row is past expiresAt, callers should mark EXPIRED before compute;
  // this is a safety net when expiresAt is provided on the input shape later.
  void now;

  if (hasBlocked) return "BLOCKED";
  if (hasExpired) return "EXPIRED";
  if (hasIncomplete) return "INCOMPLETE";
  return "READY";
}

export function isRequirementSatisfied(status: VolunteerRequirementStatusValue): boolean {
  return status === "CLEAR" || status === "WAIVED";
}

export function isMissingRequirement(status: VolunteerRequirementStatusValue): boolean {
  return status === "NOT_STARTED" || status === "PENDING" || status === "EXPIRED" || status === "FAILED";
}
