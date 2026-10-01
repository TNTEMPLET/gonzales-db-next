import { parseOrgAlertVenues, type OrgAlertRecord } from "@/lib/orgAlerts";
import prisma from "@/lib/prisma";
import { isContentOrgId } from "@/lib/siteConfig";

import { sendRainoutNotifications } from "./notify";
import { planRainout } from "./plan";
import { rainoutEmailsEnabled } from "./policy";
import { revalidateRainoutPaths } from "./revalidate";
import type { RainoutNotifySummary } from "./types";

export type RainoutWriteResult =
  | { ok: true; alert: OrgAlertRecord; summary: RainoutNotifySummary }
  | { ok: false; error: string };

function emptySummary(input: {
  allParksOut: boolean;
  parks: string[];
  error: string | null;
}): RainoutNotifySummary {
  return {
    phase: "posted",
    dryRun: !rainoutEmailsEnabled(),
    emailsEnabled: rainoutEmailsEnabled(),
    allowlistActive: false,
    calendarDate: "",
    allParksOut: input.allParksOut,
    parks: input.parks,
    newlyAffectedParks: [],
    sent: 0,
    dryRunCount: 0,
    skippedSuppressed: 0,
    skippedAllowlist: 0,
    failed: 0,
    families: [],
    error: input.error,
  };
}

export async function setOrgRainout(input: {
  organizationId: string;
  allParksOut: boolean;
  parks: string[];
  expiresAt: Date;
  actorAdminId: string | null;
}): Promise<RainoutWriteResult> {
  if (!isContentOrgId(input.organizationId)) return { ok: false, error: "Unknown league." };
  if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime())) {
    return { ok: false, error: "Invalid expiry date." };
  }

  const planned = await planRainout({
    organizationId: input.organizationId,
    allParksOut: input.allParksOut,
    parks: input.parks,
  });
  if (!planned.ok) return planned;

  const now = new Date();
  const [, created] = await prisma.$transaction([
    prisma.orgAlert.deleteMany({
      where: { organizationId: input.organizationId, expiresAt: { gt: now } },
    }),
    prisma.orgAlert.create({
      data: {
        organizationId: input.organizationId,
        allParksOut: planned.plan.allParksOut,
        venues: planned.plan.allParksOut ? [] : planned.plan.parks,
        expiresAt: input.expiresAt,
      },
    }),
  ]);

  revalidateRainoutPaths();

  let summary: RainoutNotifySummary;
  try {
    summary = await sendRainoutNotifications({
      organizationId: input.organizationId,
      allParksOut: planned.plan.allParksOut,
      parks: planned.plan.parks,
      actorAdminId: input.actorAdminId,
      alertId: created.id,
    });
  } catch (err: unknown) {
    summary = emptySummary({
      allParksOut: planned.plan.allParksOut,
      parks: planned.plan.parks,
      error: err instanceof Error ? err.message : "Rainout email failed.",
    });
  }

  return {
    ok: true,
    alert: {
      id: created.id,
      organizationId: created.organizationId,
      allParksOut: created.allParksOut,
      venues: parseOrgAlertVenues(created.venues),
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    },
    summary,
  };
}

export async function clearOrgRainout(organizationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isContentOrgId(organizationId)) return { ok: false, error: "Unknown league." };
  await prisma.orgAlert.deleteMany({
    where: { organizationId, expiresAt: { gt: new Date() } },
  });
  revalidateRainoutPaths();
  return { ok: true };
}
