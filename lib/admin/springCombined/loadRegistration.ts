import "server-only";

import { excludeRegistrationHistoryEnrollment } from "@/lib/enrollment/operationalEnrollment";
import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";

import {
  SPRING_LEAGUE_ORGS,
  summarizeSpringRegistrations,
  type SpringRegistrationSummary,
} from "./view";

/** Read-only operational enrollment rollup for Gonzales and Ascension. */
export async function loadSpringRegistrationSummary(
  seasonYear = getSeasonConfigForOrg("gonzales").year,
): Promise<SpringRegistrationSummary> {
  const rows = await prisma.enrollment.findMany({
    where: excludeRegistrationHistoryEnrollment({
      organizationId: { in: [...SPRING_LEAGUE_ORGS] },
      seasonYear,
    }),
    select: {
      organizationId: true,
      sportsConnectRowKey: true,
      ageGroup: true,
    },
  });
  return summarizeSpringRegistrations(rows, seasonYear);
}
