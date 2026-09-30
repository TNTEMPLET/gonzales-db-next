import "server-only";

import type { Prisma } from "@prisma/client";

import {
  DEFAULT_FALL_BALL_PAY_SCHEDULE,
  isFallBallOrg,
  parseFallBallPaySchedule,
  type FallBallPaySchedule,
} from "@/lib/admin/fallBallUmpirePay";
import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

export async function loadFallBallPaySchedule(input: {
  org: string;
  seasonYear?: number;
}): Promise<FallBallPaySchedule> {
  if (!isFallBallOrg(input.org)) return DEFAULT_FALL_BALL_PAY_SCHEDULE;
  const seasonYear = input.seasonYear ?? getSeasonConfigForOrg("fallball").year;
  const stored = await prisma.seasonOrgSettings.findUnique({
    where: { organizationId_seasonYear: { organizationId: input.org, seasonYear } },
    select: { umpirePayJson: true },
  });
  return parseFallBallPaySchedule(stored?.umpirePayJson);
}

export async function saveFallBallPaySchedule(input: {
  org: ContentOrgId;
  seasonYear?: number;
  schedule: unknown;
}): Promise<FallBallPaySchedule> {
  const seasonYear = input.seasonYear ?? getSeasonConfigForOrg(input.org).year;
  const schedule = parseFallBallPaySchedule(input.schedule);
  await prisma.seasonOrgSettings.upsert({
    where: { organizationId_seasonYear: { organizationId: input.org, seasonYear } },
    create: {
      organizationId: input.org,
      seasonYear,
      umpirePayJson: schedule as Prisma.InputJsonValue,
    },
    update: { umpirePayJson: schedule as Prisma.InputJsonValue },
  });
  return schedule;
}
