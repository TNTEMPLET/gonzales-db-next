/**
 * Read-only counts for divisions a Spring save is about to remove.
 *
 * Enrollment.ageGroup and Enrollment.divisionNameRaw, Team.ageGroup, and
 * DraftSession.ageGroup, for that organization and season. Registration-history
 * Enrollment rows are left out, same as other live registration counts.
 * Nothing here updates Enrollment, Team, DraftSession, or division ages.
 */

import "server-only";

import { excludeRegistrationHistoryEnrollment } from "@/lib/enrollment/operationalEnrollment";
import prisma from "@/lib/prisma";

import {
  tallyRemovalImpacts,
  type RemovalImpact,
  type RemovalLinkRows,
  type RemovedDivisionRef,
} from "./removalGuard";

export async function loadRemovalImpacts(
  seasonYear: number,
  divisions: readonly RemovedDivisionRef[],
): Promise<RemovalImpact[]> {
  const orgs = [...new Set(divisions.map((division) => division.organizationId))];
  const rowsByOrg = new Map<string, RemovalLinkRows>();
  await Promise.all(
    orgs.map(async (organizationId) => {
      const [enrollments, teams, drafts] = await Promise.all([
        prisma.enrollment.findMany({
          where: excludeRegistrationHistoryEnrollment({ organizationId, seasonYear }),
          select: { ageGroup: true, divisionNameRaw: true },
        }),
        prisma.team.findMany({
          where: { organizationId, seasonYear },
          select: { ageGroup: true },
        }),
        prisma.draftSession.findMany({
          where: { organizationId, seasonYear },
          select: { ageGroup: true },
        }),
      ]);
      rowsByOrg.set(organizationId, { enrollments, teams, drafts });
    }),
  );
  return tallyRemovalImpacts(divisions, rowsByOrg);
}
