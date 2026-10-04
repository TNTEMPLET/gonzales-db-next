import type { Prisma } from "@prisma/client";

import { PLAYER_REG_HISTORY_REPORT_KIND } from "@/lib/sportsConnect/registrationHistoryKind";

/**
 * Spring registration-history rows share a season year with live Enrollment
 * but must not move parish money, roster KPIs, parent mail, or name-collision
 * scans. Roster imports leave importRunId null or use another reportKind.
 */
export function excludeRegistrationHistoryEnrollment(
  where: Prisma.EnrollmentWhereInput,
): Prisma.EnrollmentWhereInput {
  return {
    AND: [
      where,
      {
        OR: [
          { importRunId: null },
          {
            importRun: {
              is: { reportKind: { not: PLAYER_REG_HISTORY_REPORT_KIND } },
            },
          },
        ],
      },
    ],
  };
}
