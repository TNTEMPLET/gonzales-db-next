import type { CommunicationDeliveryStatus, Prisma } from "@prisma/client";

import { getDefaultFromAddress } from "@/lib/communications/fromAddresses";
import { sendEmailViaResend } from "@/lib/communications/providers/resend";
import { createUnsubscribeToken } from "@/lib/communications/unsubscribeToken";
import prisma from "@/lib/prisma";
import { reconnectPrisma } from "@/lib/prismaRetry";
import { getSiteConfigForOrg } from "@/lib/siteConfig";

import {
  isMissingRainoutTableError,
  rainoutFailureMessage,
  RAINOUT_TABLE_MISSING_MESSAGE,
  warnMissingRainoutTable,
} from "./missingTable";
import { parkKey } from "./parks";
import { planRainout, summarizePlan, type RainoutPlan } from "./plan";
import { rainoutEmailsEnabled } from "./policy";
import type { RainoutFamilyEmail } from "./recipients";
import type { RainoutDeliveryOutcome, RainoutNotifySummary } from "./types";

export const RAINOUT_NOTIFY_SOURCE_TYPE = "RAINOUT_PARENT_NOTIFY";

const SEND_PACE_MS = 120;
const MESSAGE_BODY_CAP = 100_000;

function outcomeFor(summary: RainoutNotifySummary, email: string): RainoutDeliveryOutcome {
  return summary.families.find((family) => family.email === email)?.outcome ?? "dry_run";
}

function statusFor(outcome: RainoutDeliveryOutcome): CommunicationDeliveryStatus {
  if (outcome === "suppressed") return "SKIPPED_SUPPRESSED";
  if (outcome === "allowlist") return "SKIPPED_ALLOWLIST";
  if (outcome === "dry_run") return "SKIPPED_DRY_RUN";
  return "PENDING";
}

function withUnsubscribe(plan: RainoutPlan, family: RainoutFamilyEmail): { html: string; text: string } {
  const token = createUnsubscribeToken({
    email: family.email,
    organizationId: plan.organizationId,
    channel: "EMAIL",
  });
  const base = (
    process.env.NEXT_PUBLIC_APP_URL || getSiteConfigForOrg(plan.organizationId).siteUrl
  ).replace(/\/$/, "");
  if (!base || !token) return { html: family.html, text: family.text };
  const unsubUrl = `${base}/api/admin/communications/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    html: `${family.html}<hr/><p style="font-size:12px;color:#666">Unsubscribe: <a href="${unsubUrl}">${unsubUrl}</a></p>`,
    text: `${family.text}\n\nUnsubscribe: ${unsubUrl}`,
  };
}

function campaignBody(families: RainoutFamilyEmail[]): string {
  const chunks = families.map((family) => `--- ${family.email} (${family.mode})\n${family.text}`);
  const body = chunks.join("\n\n");
  if (body.length <= MESSAGE_BODY_CAP) return body;
  return `${body.slice(0, MESSAGE_BODY_CAP)}\n\n[truncated]`;
}

export async function previewRainoutNotifications(input: {
  organizationId: string;
  allParksOut: boolean;
  parks: string[];
}): Promise<{ ok: true; summary: RainoutNotifySummary } | { ok: false; error: string }> {
  try {
    const planned = await planRainout(input);
    if (!planned.ok) return planned;
    const summary = summarizePlan(planned.plan, "preview");
    if (planned.plan.notificationTableMissing) {
      return { ok: true, summary: { ...summary, error: RAINOUT_TABLE_MISSING_MESSAGE } };
    }
    return { ok: true, summary };
  } catch (error: unknown) {
    return { ok: false, error: rainoutFailureMessage(error, "Could not preview rainout emails.") };
  }
}

/**
 * Log every computed family on the communications delivery log.
 * Resend is called only when RAINOUT_EMAILS_ENABLED is on, the address is allowed, and it is not suppressed.
 * Parks are marked notified only after a live pass with no failed sends.
 */
export async function sendRainoutNotifications(input: {
  organizationId: string;
  allParksOut: boolean;
  parks: string[];
  actorAdminId: string | null;
  alertId: string | null;
}): Promise<RainoutNotifySummary> {
  const planned = await planRainout({
    organizationId: input.organizationId,
    allParksOut: input.allParksOut,
    parks: input.parks,
  });
  if (!planned.ok) {
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
      error: planned.error,
    };
  }

  const plan = planned.plan;
  const summary = summarizePlan(plan, "posted");
  if (plan.notificationTableMissing) {
    return { ...summary, error: RAINOUT_TABLE_MISSING_MESSAGE };
  }
  if (plan.families.length === 0) return summary;

  const fromAddress = await getDefaultFromAddress();
  const campaign = await prisma.communicationCampaign.create({
    data: {
      organizationId: plan.organizationId,
      logicalMode: "AND",
      channels: ["EMAIL"],
      status: "SENDING",
      title: `${plan.emailsEnabled ? "Rainout" : "Rainout dry-run"} ${plan.calendarDate}: ${plan.orgName}`.slice(0, 200),
      messageSubject: summary.families[0]?.subject || "Rainout update",
      messageBody: campaignBody(plan.families),
      fromEmail: fromAddress,
      createdByAdminId: input.actorAdminId,
      sentAt: new Date(),
      audienceRules: {
        create: [
          {
            ruleType: "EXPLICIT_CONTACTS",
            organizationId: plan.organizationId,
            explicitContacts: plan.families.slice(0, 500).map((family) => ({
              email: family.email,
              sourceType: RAINOUT_NOTIFY_SOURCE_TYPE,
            })) as Prisma.InputJsonValue,
          },
        ],
      },
    },
  });

  type DeliveryRow = {
    email: string;
    outcome: RainoutDeliveryOutcome;
    status: CommunicationDeliveryStatus;
    errorMessage: string | null;
    provider?: string;
    providerMessageId?: string | null;
  };

  const deliveries: DeliveryRow[] = [];
  let sent = 0;
  let failed = 0;

  for (let index = 0; index < plan.families.length; index += 1) {
    const family = plan.families[index]!;
    const outcome = outcomeFor(summary, family.email);
    if (outcome !== "send") {
      deliveries.push({
        email: family.email,
        outcome,
        status: statusFor(outcome),
        errorMessage:
          outcome === "suppressed"
            ? "Email is suppressed"
            : outcome === "allowlist"
              ? "Not on RAINOUT_EMAIL_ALLOWLIST"
              : "RAINOUT_EMAILS_ENABLED is off",
      });
      continue;
    }

    if (!rainoutEmailsEnabled()) {
      throw new Error("Refusing to send rainout email while RAINOUT_EMAILS_ENABLED is off");
    }

    if (sent + failed > 0) {
      await new Promise((resolve) => setTimeout(resolve, SEND_PACE_MS));
    }
    const rendered = withUnsubscribe(plan, family);
    try {
      const provider = await sendEmailViaResend({
        to: family.email,
        subject: family.subject,
        html: rendered.html,
        text: rendered.text,
        from: fromAddress,
      });
      if (provider.status === "skipped") {
        deliveries.push({
          email: family.email,
          outcome: "allowlist",
          status: "SKIPPED_ALLOWLIST",
          errorMessage: provider.skippedReason,
        });
        continue;
      }
      sent += 1;
      deliveries.push({
        email: family.email,
        outcome,
        status: "SENT",
        errorMessage: null,
        provider: provider.provider,
        providerMessageId: provider.providerMessageId,
      });
    } catch (err: unknown) {
      failed += 1;
      deliveries.push({
        email: family.email,
        outcome,
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Email send failed",
      });
    }
  }

  await reconnectPrisma(prisma);
  const now = new Date();
  await prisma.communicationDelivery.createMany({
    data: deliveries.map((row) => ({
      campaignId: campaign.id,
      channel: "EMAIL" as const,
      recipientType: "RAW_CONTACT" as const,
      sourceType: RAINOUT_NOTIFY_SOURCE_TYPE,
      sourceId: input.alertId,
      toEmail: row.email,
      provider: row.provider ?? null,
      providerMessageId: row.providerMessageId ?? null,
      status: row.status,
      errorMessage: row.errorMessage,
      attemptedAt: row.status === "SENT" || row.status === "FAILED" ? now : null,
      sentAt: row.status === "SENT" ? now : null,
    })),
  });

  const skippedByGuard = new Set(
    deliveries
      .filter((row) => row.status === "SKIPPED_ALLOWLIST")
      .map((row) => row.email.toLowerCase()),
  );
  const families =
    skippedByGuard.size === 0
      ? summary.families
      : summary.families.map((family) =>
          skippedByGuard.has(family.email.toLowerCase())
            ? { ...family, outcome: "allowlist" as const }
            : family,
        );
  const postedSummary: RainoutNotifySummary = {
    ...summary,
    families,
    allowlistActive: summary.allowlistActive || skippedByGuard.size > 0,
    sent,
    failed,
    dryRunCount: deliveries.filter((row) => row.status === "SKIPPED_DRY_RUN").length,
    skippedSuppressed: deliveries.filter((row) => row.status === "SKIPPED_SUPPRESSED").length,
    skippedAllowlist: deliveries.filter((row) => row.status === "SKIPPED_ALLOWLIST").length,
    error: failed > 0 ? `${failed} rainout email${failed === 1 ? "" : "s"} failed.` : null,
  };

  await prisma.communicationCampaign.update({
    where: { id: campaign.id },
    data: { status: failed > 0 ? "FAILED" : sent > 0 ? "SENT" : "CANCELED" },
  });

  const everyoneSuppressed =
    deliveries.length > 0 && deliveries.every((row) => row.status === "SKIPPED_SUPPRESSED");
  // Mark parks after a live pass that sent, or that only found suppressed addresses.
  // An allowlist that matched nobody does not mark them, so a later real send can still go out.
  // Once any message is sent, the parks are done for the day.
  const shouldMarkParks = plan.emailsEnabled && failed === 0 && (sent > 0 || everyoneSuppressed);
  if (shouldMarkParks && plan.newlyAffected.length > 0) {
    try {
      await prisma.rainoutParkNotification.createMany({
        data: plan.newlyAffected.map((park) => ({
          organizationId: plan.organizationId,
          calendarDate: plan.calendarDate,
          parkKey: parkKey(park),
        })),
        skipDuplicates: true,
      });
    } catch (error: unknown) {
      if (!isMissingRainoutTableError(error)) throw error;
      warnMissingRainoutTable();
      return { ...postedSummary, error: RAINOUT_TABLE_MISSING_MESSAGE };
    }
  }

  return postedSummary;
}
