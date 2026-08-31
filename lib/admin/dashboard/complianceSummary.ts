import "server-only";

import { listVolunteerCards } from "@/lib/volunteers/service";
import type { VolunteerReadiness } from "@/lib/volunteers/types";
import type { ContentOrgId } from "@/lib/siteConfig";
import type { RegistrationDivisionRow } from "./registrationSummary";

export type ComplianceReadinessBreakdown = Record<VolunteerReadiness, number>;

export type ComplianceSummary = {
  totalVolunteers: number;
  readiness: ComplianceReadinessBreakdown;
  readyPercent: number;
  /** Roster fill by division, reused as-is from registrationSummary's perDivision -- not recomputed. */
  rosterFillByDivision: RegistrationDivisionRow[];
};

const EMPTY_READINESS: ComplianceReadinessBreakdown = {
  READY: 0,
  INCOMPLETE: 0,
  EXPIRED: 0,
  BLOCKED: 0,
};

/**
 * Volunteer/coach compliance rollup for the dashboard. Reuses
 * listVolunteerCards() (lib/volunteers/service.ts) -- the same query the
 * People Hub's volunteer card list runs -- and buckets by the `readiness`
 * value computeVolunteerReadiness() already attaches to each card, rather
 * than recomputing readiness logic here.
 */
export async function getComplianceSummary(
  orgs: ContentOrgId[],
  perDivision: RegistrationDivisionRow[],
): Promise<ComplianceSummary> {
  const cardsPerOrg = await Promise.all(
    orgs.map((organizationId) => listVolunteerCards({ organizationId, status: "ACTIVE" })),
  );

  const readiness: ComplianceReadinessBreakdown = { ...EMPTY_READINESS };
  let totalVolunteers = 0;
  for (const cards of cardsPerOrg) {
    for (const card of cards) {
      readiness[card.readiness] += 1;
      totalVolunteers += 1;
    }
  }

  return {
    totalVolunteers,
    readiness,
    readyPercent: totalVolunteers > 0 ? Math.round((readiness.READY / totalVolunteers) * 100) : 0,
    rosterFillByDivision: perDivision,
  };
}
