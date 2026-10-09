import "server-only";

import prisma from "@/lib/prisma";
import { getRegistrationWindow } from "@/lib/registrationStatus";
import {
  resolveSeasonMode,
  settleSeasonModeOverride,
  type SeasonModeSnapshot,
} from "@/lib/season/mode";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

export type { SeasonModeSnapshot };

function datesFor(input: {
  asOf: Date;
  seasonStart: string;
  seasonEnd: string;
  registrationStart: string;
  registrationEnd: string;
  override: string | null;
}) {
  return {
    asOf: input.asOf,
    seasonStart: input.seasonStart,
    seasonEnd: input.seasonEnd,
    registrationStart: input.registrationStart,
    registrationEnd: input.registrationEnd,
    override: input.override,
  };
}

/**
 * Calculated mode for one league, plus a master-admin override when the
 * column exists. A missing column falls back to the calculated mode.
 */
export async function loadSeasonMode(
  organizationId: ContentOrgId,
  asOf: Date = new Date(),
): Promise<SeasonModeSnapshot> {
  const season = getSeasonConfigForOrg(organizationId);
  const window = await getRegistrationWindow(organizationId);
  const stored = await settleSeasonModeOverride(async () => {
    const row = await prisma.seasonOrgSettings.findUnique({
      where: {
        organizationId_seasonYear: {
          organizationId,
          seasonYear: season.year,
        },
      },
      select: { seasonModeOverride: true },
    });
    return row?.seasonModeOverride ?? null;
  });

  const shared = {
    asOf,
    seasonStart: season.startDate,
    seasonEnd: season.endDate,
    registrationStart: window.startLocal,
    registrationEnd: window.endLocal,
  };
  const resolved = resolveSeasonMode(datesFor({ ...shared, override: stored.override }));
  const automatic = resolveSeasonMode(datesFor({ ...shared, override: null }));

  return {
    organizationId,
    seasonYear: season.year,
    mode: resolved.mode,
    automatic: automatic.mode,
    source: resolved.source,
    override: resolved.source === "override" ? resolved.mode : null,
    storageReady: stored.storageReady,
  };
}
