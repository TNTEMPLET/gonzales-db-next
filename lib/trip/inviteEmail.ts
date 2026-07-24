import "server-only";

import { getDefaultFromAddress } from "@/lib/communications/fromAddresses";
import { sendEmailViaResend } from "@/lib/communications/providers/resend";
import { createUnsubscribeToken } from "@/lib/communications/unsubscribeToken";
import {
  getCanonicalBallotOriginForOrganizationId,
  getOrgDisplayName,
  isContentOrgId,
  type ContentOrgId,
} from "@/lib/siteConfig";
import {
  applyTripInviteTemplate,
  DEFAULT_TRIP_INVITE_BODY,
  DEFAULT_TRIP_INVITE_SUBJECT,
  type TripInviteMergeVars,
} from "@/lib/trip/inviteEmailTemplates";
import { parseAnswersJson } from "@/lib/trip/validate";
import prisma from "@/lib/prisma";

export {
  applyTripInviteTemplate,
  DEFAULT_TRIP_INVITE_BODY,
  DEFAULT_TRIP_INVITE_SUBJECT,
  type TripInviteMergeVars,
} from "@/lib/trip/inviteEmailTemplates";

export type TripInviteRecipientPreview = {
  participantId: string;
  playerFullName: string;
  status: string;
  email: string | null;
  guardianName: string | null;
  inviteUrl: string;
  inviteEmailSentAt: string | null;
  inviteEmailTo: string | null;
  inviteEmailCount: number;
  emailSource: "answers" | "submitter" | "none";
  canSend: boolean;
  skipReason: string | null;
};

function resolveGuardianEmail(participant: {
  response: {
    answersJson: string;
    submitterEmail: string | null;
    submitterName: string | null;
  } | null;
}): {
  email: string | null;
  guardianName: string | null;
  guardianFirstName: string;
  source: "answers" | "submitter" | "none";
} {
  const answers = parseAnswersJson(participant.response?.answersJson);
  const fromAnswers =
    typeof answers.guardian1_email === "string"
      ? answers.guardian1_email.trim().toLowerCase()
      : "";
  const gFirst =
    typeof answers.guardian1_first_name === "string"
      ? answers.guardian1_first_name.trim()
      : "";
  const gLast =
    typeof answers.guardian1_last_name === "string"
      ? answers.guardian1_last_name.trim()
      : "";
  const nameFromAnswers = [gFirst, gLast].filter(Boolean).join(" ");

  if (fromAnswers && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAnswers)) {
    return {
      email: fromAnswers,
      guardianName: nameFromAnswers || participant.response?.submitterName || null,
      guardianFirstName: gFirst || nameFromAnswers.split(/\s+/)[0] || "Parent",
      source: "answers",
    };
  }

  const submitter = participant.response?.submitterEmail?.trim().toLowerCase() || "";
  if (submitter && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitter)) {
    const sn = participant.response?.submitterName?.trim() || "";
    return {
      email: submitter,
      guardianName: sn || nameFromAnswers || null,
      guardianFirstName: sn.split(/\s+/)[0] || gFirst || "Parent",
      source: "submitter",
    };
  }

  return {
    email: null,
    guardianName: nameFromAnswers || null,
    guardianFirstName: gFirst || "Parent",
    source: "none",
  };
}

function playerFirstName(fullName: string, answers: ReturnType<typeof parseAnswersJson>) {
  if (typeof answers.first_name === "string" && answers.first_name.trim()) {
    return answers.first_name.trim();
  }
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export async function previewTripInviteRecipients(
  eventId: string,
  organizationId: string,
): Promise<{
  event: { id: string; name: string; teamLabel: string | null; status: string };
  recipients: TripInviteRecipientPreview[];
  summary: {
    total: number;
    withEmail: number;
    missingEmail: number;
    alreadySent: number;
  };
}> {
  const event = await prisma.tripEvent.findFirst({
    where: { id: eventId, organizationId },
    include: {
      participants: {
        orderBy: { playerFullName: "asc" },
        include: { response: true },
      },
    },
  });
  if (!event) throw new Error("Event not found");

  const baseUrl = getCanonicalBallotOriginForOrganizationId(organizationId);
  const recipients: TripInviteRecipientPreview[] = event.participants.map((p) => {
    const resolved = resolveGuardianEmail(p);
    const inviteUrl = `${baseUrl}/trip/${p.inviteToken}`;
    let skipReason: string | null = null;
    if (event.status === "draft") skipReason = "Event is still draft — open it before emailing";
    else if (event.status === "closed") skipReason = "Event is closed";
    else if (!resolved.email) skipReason = "No guardian email on file";

    return {
      participantId: p.id,
      playerFullName: p.playerFullName,
      status: p.status,
      email: resolved.email,
      guardianName: resolved.guardianName,
      inviteUrl,
      inviteEmailSentAt: p.inviteEmailSentAt?.toISOString() ?? null,
      inviteEmailTo: p.inviteEmailTo,
      inviteEmailCount: p.inviteEmailCount,
      emailSource: resolved.source,
      canSend: !skipReason && Boolean(resolved.email),
      skipReason,
    };
  });

  const withEmail = recipients.filter((r) => r.email).length;
  const alreadySent = recipients.filter((r) => r.inviteEmailCount > 0).length;

  return {
    event: {
      id: event.id,
      name: event.name,
      teamLabel: event.teamLabel,
      status: event.status,
    },
    recipients,
    summary: {
      total: recipients.length,
      withEmail,
      missingEmail: recipients.length - withEmail,
      alreadySent,
    },
  };
}

export type SendTripInvitesInput = {
  eventId: string;
  organizationId: string;
  /** If set, only these participants; otherwise all with email */
  participantIds?: string[] | null;
  /** Resend even if already emailed */
  resend?: boolean;
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
  fromEmail?: string | null;
  createdByAdminId?: string | null;
};

export async function sendTripInviteEmails(input: SendTripInvitesInput) {
  const event = await prisma.tripEvent.findFirst({
    where: { id: input.eventId, organizationId: input.organizationId },
    include: {
      participants: {
        orderBy: { playerFullName: "asc" },
        include: { response: true },
      },
    },
  });
  if (!event) throw new Error("Event not found");
  if (event.status === "draft") {
    throw Object.assign(new Error("Open the trip event before emailing parents."), {
      status: 409,
    });
  }
  if (event.status === "closed") {
    throw Object.assign(new Error("This trip form is closed."), { status: 409 });
  }

  const idFilter = input.participantIds?.length
    ? new Set(input.participantIds)
    : null;

  const baseUrl = getCanonicalBallotOriginForOrganizationId(input.organizationId);
  const orgName = isContentOrgId(input.organizationId)
    ? getOrgDisplayName(input.organizationId as ContentOrgId)
    : "AP Baseball";

  const subjectTpl =
    (input.subjectTemplate ?? "").trim() || DEFAULT_TRIP_INVITE_SUBJECT;
  const bodyTpl = (input.bodyTemplate ?? "").trim() || DEFAULT_TRIP_INVITE_BODY;
  const fromAddress =
    (input.fromEmail ?? "").trim() || (await getDefaultFromAddress());

  type Pending = {
    participantId: string;
    playerFullName: string;
    email: string;
    vars: TripInviteMergeVars;
  };

  const pending: Pending[] = [];
  const skipped: Array<{ participantId: string; playerFullName: string; reason: string }> =
    [];

  for (const p of event.participants) {
    if (idFilter && !idFilter.has(p.id)) continue;

    const resolved = resolveGuardianEmail(p);
    if (!resolved.email) {
      skipped.push({
        participantId: p.id,
        playerFullName: p.playerFullName,
        reason: "No guardian email",
      });
      continue;
    }
    if (!input.resend && p.inviteEmailCount > 0) {
      skipped.push({
        participantId: p.id,
        playerFullName: p.playerFullName,
        reason: "Already sent (use resend to send again)",
      });
      continue;
    }

    const answers = parseAnswersJson(p.response?.answersJson);
    const inviteUrl = `${baseUrl}/trip/${p.inviteToken}`;
    pending.push({
      participantId: p.id,
      playerFullName: p.playerFullName,
      email: resolved.email,
      vars: {
        player_name: p.playerFullName,
        player_first_name: playerFirstName(p.playerFullName, answers),
        guardian_name: resolved.guardianName || "Parent/Guardian",
        guardian_first_name: resolved.guardianFirstName,
        event_name: event.name,
        team_label: event.teamLabel || "",
        org_name: orgName,
        invite_url: inviteUrl,
      },
    });
  }

  if (pending.length === 0) {
    return {
      campaignId: null as string | null,
      sent: 0,
      failed: 0,
      skipped,
      totalPending: 0,
    };
  }

  // Campaign audit row (Communications history)
  const campaign = await prisma.communicationCampaign.create({
    data: {
      organizationId: input.organizationId,
      channels: ["EMAIL"],
      status: "SENDING",
      title: `Trip invites: ${event.name}`.slice(0, 200),
      messageSubject: subjectTpl,
      messageBody: bodyTpl,
      fromEmail: fromAddress,
      createdByAdminId: input.createdByAdminId ?? null,
      audienceRules: {
        create: {
          ruleType: "ORGANIZATION",
          organizationId: input.organizationId,
        },
      },
      recipientSnapshots: {
        create: pending.map((row) => ({
          recipientType: "TRIP_GUARDIAN" as const,
          tripParticipantId: row.participantId,
          email: row.email,
          matchReasons: [`trip_event:${event.id}`],
        })),
      },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const subject = applyTripInviteTemplate(subjectTpl, row.vars);
    const text = applyTripInviteTemplate(bodyTpl, row.vars);

    const suppressed = await prisma.emailSuppression.findFirst({
      where: {
        email: row.email,
        OR: [{ organizationId: input.organizationId }, { organizationId: null }],
      },
      select: { id: true },
    });
    if (suppressed) {
      failed += 1;
      await prisma.communicationDelivery.create({
        data: {
          campaignId: campaign.id,
          channel: "EMAIL",
          recipientType: "TRIP_GUARDIAN",
          tripParticipantId: row.participantId,
          toEmail: row.email,
          status: "SKIPPED_SUPPRESSED",
          errorMessage: "Email is suppressed",
          attemptedAt: new Date(),
        },
      });
      continue;
    }

    const unsubscribeToken = createUnsubscribeToken({
      email: row.email,
      organizationId: input.organizationId,
      channel: "EMAIL",
    });
    const appBase = process.env.NEXT_PUBLIC_APP_URL || baseUrl;
    const unsubUrl =
      appBase && unsubscribeToken
        ? `${appBase.replace(/\/$/, "")}/api/admin/communications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
        : null;

    const html = `${text.replaceAll("\n", "<br/>")}${
      unsubUrl
        ? `<hr/><p style="font-size:12px;color:#666">Unsubscribe: <a href="${unsubUrl}">${unsubUrl}</a></p>`
        : ""
    }`;

    try {
      const providerResponse = await sendEmailViaResend({
        to: row.email,
        subject,
        html,
        text,
        from: fromAddress,
      });
      sent += 1;
      await prisma.communicationDelivery.create({
        data: {
          campaignId: campaign.id,
          channel: "EMAIL",
          recipientType: "TRIP_GUARDIAN",
          tripParticipantId: row.participantId,
          toEmail: row.email,
          provider: providerResponse.provider,
          providerMessageId: providerResponse.providerMessageId,
          status: "SENT",
          attemptedAt: new Date(),
          sentAt: new Date(),
        },
      });
      await prisma.tripParticipant.update({
        where: { id: row.participantId },
        data: {
          inviteEmailSentAt: new Date(),
          inviteEmailTo: row.email,
          inviteEmailCount: { increment: 1 },
        },
      });
    } catch (err: unknown) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Email send failed";
      await prisma.communicationDelivery.create({
        data: {
          campaignId: campaign.id,
          channel: "EMAIL",
          recipientType: "TRIP_GUARDIAN",
          tripParticipantId: row.participantId,
          toEmail: row.email,
          status: "FAILED",
          errorMessage: message,
          attemptedAt: new Date(),
        },
      });
    }
  }

  await prisma.communicationCampaign.update({
    where: { id: campaign.id },
    data: {
      status: failed > 0 && sent === 0 ? "FAILED" : "SENT",
      sentAt: new Date(),
    },
  });

  return {
    campaignId: campaign.id,
    sent,
    failed,
    skipped,
    totalPending: pending.length,
  };
}
