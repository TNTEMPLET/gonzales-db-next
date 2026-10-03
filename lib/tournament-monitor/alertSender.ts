import type { TournamentMonitorEvent, TournamentMonitorSubscription } from "@prisma/client";

import { sendEmailViaResend } from "@/lib/communications/providers/resend";
import prisma from "@/lib/prisma";

import { planTournamentAlertDelivery } from "./alertPlan";

export { planTournamentAlertDelivery } from "./alertPlan";

export type TournamentAlertSendResult = {
  emailSentCount: number;
  smsSentCount: number;
  failedCount: number;
  failures: string[];
};

export function getTournamentAlertProviderStatus() {
  return {
    emailConfigured: Boolean(process.env.RESEND_API_KEY && (process.env.COMMUNICATIONS_EMAIL_FROM || process.env.RESEND_FROM_EMAIL)),
    smsConfigured: false,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function alertHtml(message: string) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.45">${escapeHtml(message).replaceAll("\n", "<br/>")}</div>`;
}

async function activeSubscriptions() {
  return prisma.tournamentMonitorSubscription.findMany({
    where: { active: true },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
}

async function sendEmail(subscription: TournamentMonitorSubscription, event: Pick<TournamentMonitorEvent, "title" | "message">) {
  const email = subscription.email?.trim().toLowerCase();
  if (!email) throw new Error(`${subscription.name} has no email address`);
  return sendEmailViaResend({
    to: email,
    subject: event.title,
    html: alertHtml(event.message),
    text: event.message,
  });
}

export async function sendTournamentMonitorEvent(
  event: Pick<TournamentMonitorEvent, "id" | "title" | "message">,
): Promise<TournamentAlertSendResult> {
  const subscriptions = await activeSubscriptions();
  let emailSentCount = 0;
  const smsSentCount = 0;
  let failedCount = 0;
  const failures: string[] = [];

  for (const subscription of subscriptions) {
    const plan = planTournamentAlertDelivery(subscription.channels);
    if (!plan.email) continue;
    try {
      const emailResult = await sendEmail(subscription, event);
      if (emailResult.status === "skipped") {
        failures.push(`Email to ${subscription.name}: ${emailResult.skippedReason ?? "skipped by allowlist"}`);
      } else {
        emailSentCount += 1;
      }
    } catch (error: unknown) {
      failedCount += 1;
      failures.push(`Email to ${subscription.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await prisma.tournamentMonitorEvent.update({
    where: { id: event.id },
    data: {
      emailSentCount,
      smsSentCount,
      failedCount,
      sentAt: emailSentCount + smsSentCount > 0 ? new Date() : null,
    },
  });

  return { emailSentCount, smsSentCount, failedCount, failures };
}
