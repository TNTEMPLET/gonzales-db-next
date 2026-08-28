import type { TournamentMonitorEvent, TournamentMonitorSubscription } from "@prisma/client";

import { isSmsSendingEnabled } from "@/lib/communications/config";
import { sendEmailViaResend } from "@/lib/communications/providers/resend";
import { sendSmsViaTwilio } from "@/lib/communications/providers/twilio";
import prisma from "@/lib/prisma";

export type TournamentAlertSendResult = {
  emailSentCount: number;
  smsSentCount: number;
  failedCount: number;
  failures: string[];
};

export function getTournamentAlertProviderStatus() {
  return {
    emailConfigured: Boolean(process.env.RESEND_API_KEY && (process.env.COMMUNICATIONS_EMAIL_FROM || process.env.RESEND_FROM_EMAIL)),
    smsConfigured: Boolean(
      isSmsSendingEnabled() &&
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_PHONE,
    ),
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

function smsBody(title: string, message: string) {
  const body = `${title}
${message}`.replace(/\s+$/g, "");
  return body.length > 1500 ? `${body.slice(0, 1497)}...` : body;
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

async function sendSms(subscription: TournamentMonitorSubscription, event: Pick<TournamentMonitorEvent, "title" | "message">) {
  const phone = subscription.phone?.trim();
  if (!phone) throw new Error(`${subscription.name} has no phone number`);
  return sendSmsViaTwilio({ to: phone, body: smsBody(event.title, event.message) });
}

export async function sendTournamentMonitorEvent(
  event: Pick<TournamentMonitorEvent, "id" | "title" | "message">,
): Promise<TournamentAlertSendResult> {
  const subscriptions = await activeSubscriptions();
  let emailSentCount = 0;
  let smsSentCount = 0;
  let failedCount = 0;
  const failures: string[] = [];

  for (const subscription of subscriptions) {
    if (subscription.channels.includes("EMAIL")) {
      try {
        await sendEmail(subscription, event);
        emailSentCount += 1;
      } catch (error: unknown) {
        failedCount += 1;
        failures.push(`Email to ${subscription.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (subscription.channels.includes("SMS")) {
      try {
        await sendSms(subscription, event);
        smsSentCount += 1;
      } catch (error: unknown) {
        failedCount += 1;
        failures.push(`SMS to ${subscription.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
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
