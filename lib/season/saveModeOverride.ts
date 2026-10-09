import "server-only";

import prisma from "@/lib/prisma";
import type { SeasonMode } from "@/lib/season/mode";
import type { ContentOrgId } from "@/lib/siteConfig";

/**
 * Set or clear the season-mode override for one league and season year.
 * The update writes only the three override columns.
 */
export async function saveSeasonModeOverride(input: {
  organizationId: ContentOrgId;
  seasonYear: number;
  seasonModeOverride: SeasonMode | null;
  adminId: string;
}): Promise<void> {
  const where = {
    organizationId_seasonYear: {
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
    },
  };

  if (input.seasonModeOverride) {
    await prisma.seasonOrgSettings.upsert({
      where,
      create: {
        organizationId: input.organizationId,
        seasonYear: input.seasonYear,
        seasonModeOverride: input.seasonModeOverride,
        seasonModeOverrideAt: new Date(),
        seasonModeOverrideByAdminId: input.adminId,
      },
      update: {
        seasonModeOverride: input.seasonModeOverride,
        seasonModeOverrideAt: new Date(),
        seasonModeOverrideByAdminId: input.adminId,
      },
    });
    return;
  }

  await prisma.seasonOrgSettings.upsert({
    where,
    create: {
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
      seasonModeOverride: null,
      seasonModeOverrideAt: null,
      seasonModeOverrideByAdminId: null,
    },
    update: {
      seasonModeOverride: null,
      seasonModeOverrideAt: null,
      seasonModeOverrideByAdminId: null,
    },
  });
}
