import type { Prisma } from "@prisma/client";

import { isCommunicationsModuleEnabled } from "@/lib/communications/config";
import { getDefaultFromAddress } from "@/lib/communications/fromAddresses";
import { sendEmailViaResend } from "@/lib/communications/providers/resend";
import { isEmailSuppressed } from "@/lib/communications/suppression";
import { createUnsubscribeToken } from "@/lib/communications/unsubscribeToken";
import prisma from "@/lib/prisma";
import { reconnectPrisma } from "@/lib/prismaRetry";
import { getOrgDisplayName, getSiteConfigForOrg, type ContentOrgId } from "@/lib/siteConfig";
import {
  COACH_NOTIFY_SOURCE_TYPE,
  NOTIFY_DAY_LABELS,
  buildCoachScheduleEmail,
  coachDisplayName,
  coachNotifyStatus,
  coachNotifyStatusLabel,
  formatNotifyDate,
  formatNotifyGameLine,
  formatNotifyPracticeLine,
  parseCoachNotifyState,
  withCoachNotifyState,
  type CoachNotifyPreviewRow,
  type CoachNotifySummary,
} from "@/lib/scheduler/coachScheduleEmail";
import { buildCoachScheduleAttachments } from "@/lib/scheduler/coachScheduleAttachments";
import { formatPracticePlanText, type TeamPracticeSlotView } from "@/lib/scheduler/practicePlanText";
import { parseSeasonDateWindows } from "@/lib/scheduler/seasonWindows";
import { dateKey } from "@/lib/scheduler/validation";

export {
  COACH_NOTIFY_SOURCE_TYPE,
  parseCoachNotifyState,
  withCoachNotifyState,
  type CoachNotifyPreviewRow,
  type CoachNotifySummary,
} from "@/lib/scheduler/coachScheduleEmail";

function windowLabel(start: string, end: string): string {
  const left = formatNotifyDate(start);
  const right = formatNotifyDate(end);
  if (!left && !right) return "";
  return `${left || "—"} – ${right || "—"}`;
}

function gameInvolvesTeam(
  game: {
    homeTeamId: string | null;
    awayTeamId: string | null;
    homeTeamName: string;
    awayTeamName: string;
    division: string;
    ageGroup: string | null;
  },
  team: { id: string; teamName: string; ageGroup: string },
): boolean {
  if (game.homeTeamId === team.id || game.awayTeamId === team.id) return true;
  const division = game.ageGroup || game.division;
  if (division !== team.ageGroup && game.division !== team.ageGroup) return false;
  return game.homeTeamName === team.teamName || game.awayTeamName === team.teamName;
}

export async function loadCoachScheduleNotify(params: {
  organizationId: string;
  seasonId: string;
}): Promise<{ summary: CoachNotifySummary; rows: CoachNotifyPreviewRow[] }> {
  const season = await prisma.scheduleSeason.findFirst({
    where: { id: params.seasonId, organizationId: params.organizationId },
  });
  if (!season) {
    throw new Error("Schedule season was not found");
  }

  const org = params.organizationId as ContentOrgId;
  const cfg = getSiteConfigForOrg(org);
  const orgName = getOrgDisplayName(org);
  const coachCornerUrl = `${cfg.siteUrl.replace(/\/$/, "")}/coach-corner`;
  const seasonStart = season.startsOn ? dateKey(season.startsOn) : "";
  const seasonEnd = season.endsOn ? dateKey(season.endsOn) : "";
  const windows = parseSeasonDateWindows(season.settings, seasonStart, seasonEnd);
  const lastSent = parseCoachNotifyState(season.settings);

  const [teams, games, suppressions] = await Promise.all([
    prisma.team.findMany({
      where: {
        organizationId: params.organizationId,
        seasonYear: season.seasonYear,
        NOT: { teamName: { equals: "Unallocated", mode: "insensitive" } },
      },
      orderBy: [{ ageGroup: "asc" }, { teamName: "asc" }],
      include: {
        coachAssignments: {
          where: { role: "HEAD_COACH" },
          include: {
            registeredUser: {
              select: { id: true, email: true, name: true, firstName: true, lastName: true, isBlocked: true },
            },
          },
        },
        practiceSlots: {
          include: { park: { select: { name: true } }, field: { select: { name: true } } },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        },
      },
    }),
    prisma.scheduleDraftGame.findMany({
      where: {
        organizationId: params.organizationId,
        seasonId: season.id,
        NOT: { status: "CANCELED" },
      },
      include: { park: { select: { name: true } }, field: { select: { name: true } } },
      orderBy: [{ gameDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.emailSuppression.findMany({
      where: { OR: [{ organizationId: params.organizationId }, { organizationId: null }] },
      select: { email: true },
    }),
  ]);

  const suppressedEmails = new Set(suppressions.map((row) => row.email.trim().toLowerCase()).filter(Boolean));
  const siblingsByGroup = new Map<string, { teamId: string; teamName: string; startTime: string }[]>();
  for (const team of teams) {
    for (const slot of team.practiceSlots) {
      if (!slot.sharedFieldGroupId) continue;
      const list = siblingsByGroup.get(slot.sharedFieldGroupId) ?? [];
      list.push({ teamId: team.id, teamName: team.teamName, startTime: slot.startTime });
      siblingsByGroup.set(slot.sharedFieldGroupId, list);
    }
  }

  const placedGames = games.filter((game) => Boolean(game.gameDate && game.startTime && game.homeTeamName && game.awayTeamName));
  const practiceWindow = windowLabel(windows.practiceStartsOn, windows.practiceEndsOn);
  const gamesWindow = windowLabel(windows.gamesStartsOn, windows.gamesEndsOn);

  const rows: CoachNotifyPreviewRow[] = teams.map((team) => {
    const head = team.coachAssignments.find((assignment) => !assignment.registeredUser.isBlocked)?.registeredUser ?? null;
    const coachName = coachDisplayName(head);
    const coachEmail = head?.email?.trim().toLowerCase() || null;
    const practiceViews: TeamPracticeSlotView[] = team.practiceSlots.map((slot) => {
      const siblings = slot.sharedFieldGroupId ? siblingsByGroup.get(slot.sharedFieldGroupId) ?? [] : [];
      const paired = siblings.find((item) => item.teamId !== team.id) ?? null;
      return {
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        parkName: slot.park?.name ?? null,
        fieldName: slot.field?.name ?? null,
        pairedTeamName: paired?.teamName ?? null,
        isFirst: paired ? slot.startTime <= paired.startTime : null,
        notes: slot.notes,
      };
    });
    const practicePlan = formatPracticePlanText(practiceViews);
    const practices = practiceViews.map((slot) =>
      formatNotifyPracticeLine({
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        parkName: slot.parkName,
        fieldName: slot.fieldName,
        pairedTeamName: slot.pairedTeamName,
        notes: slot.notes,
      }),
    );
    const teamGames = placedGames
      .filter((game) => gameInvolvesTeam(game, team))
      .map((game) => {
        const home = game.homeTeamId === team.id || game.homeTeamName === team.teamName;
        return formatNotifyGameLine({
          gameDate: game.gameDate,
          startTime: game.startTime,
          opponent: home ? game.awayTeamName : game.homeTeamName,
          parkName: game.park?.name ?? null,
          fieldName: game.field?.name ?? null,
          home,
        });
      });
    const status = coachNotifyStatus({
      coachEmail,
      registeredUserId: head?.id ?? null,
      suppressed: Boolean(coachEmail && suppressedEmails.has(coachEmail)),
    });
    const email = buildCoachScheduleEmail({
      coachName,
      orgName,
      seasonName: season.name,
      ageGroup: team.ageGroup,
      teamName: team.teamName,
      practicePlan,
      practices,
      games: teamGames,
      practiceWindow,
      gamesWindow,
      coachCornerUrl,
    });
    return {
      teamId: team.id,
      teamName: team.teamName,
      ageGroup: team.ageGroup,
      coachName,
      coachEmail,
      registeredUserId: head?.id ?? null,
      practiceCount: team.practiceSlots.length,
      practiceSummary: practiceViews.map((slot) => NOTIFY_DAY_LABELS[slot.dayOfWeek] ?? "").filter(Boolean).join(", ") || "—",
      practicePlan,
      practices,
      gameCount: teamGames.length,
      seasonName: season.name,
      orgName,
      practiceWindow,
      gamesWindow,
      games: teamGames,
      status,
      statusLabel: coachNotifyStatusLabel(status),
      subject: email.subject,
      text: email.text,
      html: email.html,
    };
  });

  const canSend = isCommunicationsModuleEnabled();
  const summary: CoachNotifySummary = {
    teamCount: rows.length,
    readyCount: rows.filter((row) => row.status === "ready").length,
    missingCoachCount: rows.filter((row) => row.status === "no_head_coach").length,
    missingEmailCount: rows.filter((row) => row.status === "no_email").length,
    suppressedCount: rows.filter((row) => row.status === "suppressed").length,
    practiceCount: rows.filter((row) => row.practiceCount > 0).length,
    gameCount: placedGames.length,
    lastSentAt: lastSent.lastSentAt,
    lastSentCount: lastSent.lastSentCount,
    lastCampaignId: lastSent.lastCampaignId,
    canSend,
    sendBlockedReason: canSend ? null : "Communications is turned off",
  };

  return { summary, rows };
}

export async function sendCoachScheduleEmails(params: {
  organizationId: string;
  seasonId: string;
  teamIds?: string[] | null;
  actorAdminId: string | null;
  replyTo?: string | null;
}): Promise<{
  campaignId: string | null;
  sent: number;
  failed: number;
  skipped: number;
  readyCount: number;
}> {
  if (!isCommunicationsModuleEnabled()) {
    throw new Error("Communications module is disabled");
  }

  const { summary, rows } = await loadCoachScheduleNotify({
    organizationId: params.organizationId,
    seasonId: params.seasonId,
  });
  const wanted = params.teamIds?.length ? new Set(params.teamIds) : null;
  const pending = rows.filter((row) => row.status === "ready" && (!wanted || wanted.has(row.teamId)));
  if (!pending.length) {
    return { campaignId: null, sent: 0, failed: 0, skipped: summary.teamCount, readyCount: 0 };
  }

  const season = await prisma.scheduleSeason.findFirstOrThrow({
    where: { id: params.seasonId, organizationId: params.organizationId },
  });
  const fromAddress = await getDefaultFromAddress();
  const campaign = await prisma.communicationCampaign.create({
    data: {
      organizationId: params.organizationId,
      logicalMode: "AND",
      channels: ["EMAIL"],
      status: "SENDING",
      title: `Coach schedules: ${season.name}`.slice(0, 200),
      messageSubject: `${season.name} team schedules`,
      messageBody: "Personalized per team — see deliveries.",
      fromEmail: fromAddress,
      createdByAdminId: params.actorAdminId,
      sentAt: new Date(),
      audienceRules: {
        create: [
          {
            ruleType: "EXPLICIT_USERS",
            organizationId: params.organizationId,
            explicitRegisteredUserIds: pending
              .map((row) => row.registeredUserId)
              .filter((id): id is string => Boolean(id)),
          },
        ],
      },
    },
  });

  await prisma.communicationRecipientSnapshot.createMany({
    data: pending.map((row) => ({
      campaignId: campaign.id,
      recipientType: "REGISTERED_USER" as const,
      registeredUserId: row.registeredUserId,
      sourceType: COACH_NOTIFY_SOURCE_TYPE,
      sourceId: row.teamId,
      email: row.coachEmail,
      matchReasons: ["HEAD_COACH"],
    })),
  });

  type Delivery = {
    teamId: string;
    email: string;
    registeredUserId: string | null;
    status: "SENT" | "FAILED";
    errorMessage?: string;
    provider?: string;
    providerMessageId?: string | null;
  };
  const results: Delivery[] = [];
  const appBase = process.env.NEXT_PUBLIC_APP_URL || getSiteConfigForOrg(params.organizationId as ContentOrgId).siteUrl;
  const paceMs = 120;

  for (let i = 0; i < pending.length; i++) {
    const row = pending[i]!;
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, paceMs));
    const unsubscribeToken = createUnsubscribeToken({
      email: row.coachEmail!,
      organizationId: params.organizationId,
      channel: "EMAIL",
    });
    const unsubUrl =
      appBase && unsubscribeToken
        ? `${appBase.replace(/\/$/, "")}/api/admin/communications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
        : null;
    const html = `${row.html}${
      unsubUrl
        ? `<hr/><p style="font-size:12px;color:#666">Unsubscribe: <a href="${unsubUrl}">${unsubUrl}</a></p>`
        : ""
    }`;
    try {
      const provider = await sendEmailViaResend({
        to: row.coachEmail!,
        subject: row.subject,
        html,
        text: row.text,
        from: fromAddress,
        replyTo: params.replyTo,
        attachments: buildCoachScheduleAttachments(row),
      });
      results.push({
        teamId: row.teamId,
        email: row.coachEmail!,
        registeredUserId: row.registeredUserId,
        status: "SENT",
        provider: provider.provider,
        providerMessageId: provider.providerMessageId,
      });
    } catch (err: unknown) {
      results.push({
        teamId: row.teamId,
        email: row.coachEmail!,
        registeredUserId: row.registeredUserId,
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : "Email send failed",
      });
    }
  }

  await reconnectPrisma(prisma);
  const now = new Date();
  if (results.length) {
    await prisma.communicationDelivery.createMany({
      data: results.map((row) => ({
        campaignId: campaign.id,
        channel: "EMAIL" as const,
        recipientType: "REGISTERED_USER" as const,
        registeredUserId: row.registeredUserId,
        sourceType: COACH_NOTIFY_SOURCE_TYPE,
        sourceId: row.teamId,
        toEmail: row.email,
        provider: row.provider,
        providerMessageId: row.providerMessageId,
        status: row.status,
        errorMessage: row.errorMessage ?? null,
        attemptedAt: now,
        sentAt: row.status === "SENT" ? now : null,
      })),
    });
  }

  const sent = results.filter((row) => row.status === "SENT").length;
  const failed = results.length - sent;
  await prisma.communicationCampaign.update({
    where: { id: campaign.id },
    data: { status: sent > 0 ? "SENT" : "FAILED" },
  });

  if (sent > 0) {
    await prisma.scheduleSeason.update({
      where: { id: season.id },
      data: {
        settings: withCoachNotifyState(season.settings, {
          lastSentAt: now.toISOString(),
          lastSentCount: sent,
          lastCampaignId: campaign.id,
        }) as Prisma.InputJsonValue,
      },
    });
  }

  return {
    campaignId: campaign.id,
    sent,
    failed,
    skipped: summary.teamCount - pending.length,
    readyCount: pending.length,
  };
}

function pickSampleRow(rows: CoachNotifyPreviewRow[], teamId?: string | null) {
  if (teamId) return rows.find((row) => row.teamId === teamId) ?? null;
  return (
    rows.find((row) => row.ageGroup === "6U MOD" && row.teamName === "Astros") ??
    rows.find((row) => row.practiceCount > 0 && row.gameCount > 0) ??
    rows[0] ??
    null
  );
}

/** One preview email to an admin address. Does not mark the wizard Notify step complete. */
export async function sendCoachScheduleSample(params: {
  organizationId: string;
  seasonId: string;
  sampleEmail: string;
  teamId?: string | null;
  actorAdminId: string | null;
  replyTo?: string | null;
}): Promise<{ campaignId: string; sent: number; teamName: string; ageGroup: string; to: string }> {
  if (!isCommunicationsModuleEnabled()) {
    throw new Error("Communications module is disabled");
  }

  const to = params.sampleEmail.trim().toLowerCase();
  if (!to || !to.includes("@")) {
    throw new Error("A valid sample email is required");
  }

  const { rows } = await loadCoachScheduleNotify({
    organizationId: params.organizationId,
    seasonId: params.seasonId,
  });
  const row = pickSampleRow(rows, params.teamId);
  if (!row) {
    throw new Error("No team is available to preview");
  }

  if (await isEmailSuppressed(to, params.organizationId)) {
    throw new Error(`${to} is on the suppression list`);
  }

  const season = await prisma.scheduleSeason.findFirstOrThrow({
    where: { id: params.seasonId, organizationId: params.organizationId },
  });
  const fromAddress = await getDefaultFromAddress();
  const campaign = await prisma.communicationCampaign.create({
    data: {
      organizationId: params.organizationId,
      logicalMode: "AND",
      channels: ["EMAIL"],
      status: "SENDING",
      title: `Coach schedule sample: ${season.name}`.slice(0, 200),
      messageSubject: row.subject,
      messageBody: row.text,
      fromEmail: fromAddress,
      createdByAdminId: params.actorAdminId,
      sentAt: new Date(),
      audienceRules: {
        create: [
          {
            ruleType: "EXPLICIT_CONTACTS",
            organizationId: params.organizationId,
            explicitContacts: [{ email: to, sourceType: `${COACH_NOTIFY_SOURCE_TYPE}_SAMPLE` }],
          },
        ],
      },
    },
  });

  const appBase = process.env.NEXT_PUBLIC_APP_URL || getSiteConfigForOrg(params.organizationId as ContentOrgId).siteUrl;
  const unsubscribeToken = createUnsubscribeToken({
    email: to,
    organizationId: params.organizationId,
    channel: "EMAIL",
  });
  const unsubUrl =
    appBase && unsubscribeToken
      ? `${appBase.replace(/\/$/, "")}/api/admin/communications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
      : null;
  const html = `${row.html}${
    unsubUrl
      ? `<hr/><p style="font-size:12px;color:#666">Unsubscribe: <a href="${unsubUrl}">${unsubUrl}</a></p>`
      : ""
  }`;

  try {
    const provider = await sendEmailViaResend({
      to,
      subject: row.subject,
      html,
      text: row.text,
      from: fromAddress,
      replyTo: params.replyTo,
      attachments: buildCoachScheduleAttachments(row),
    });
    await reconnectPrisma(prisma);
    await prisma.communicationDelivery.create({
      data: {
        campaignId: campaign.id,
        channel: "EMAIL",
        recipientType: "RAW_CONTACT",
        sourceType: `${COACH_NOTIFY_SOURCE_TYPE}_SAMPLE`,
        sourceId: row.teamId,
        toEmail: to,
        provider: provider.provider,
        providerMessageId: provider.providerMessageId,
        status: "SENT",
        attemptedAt: new Date(),
        sentAt: new Date(),
      },
    });
    await prisma.communicationCampaign.update({
      where: { id: campaign.id },
      data: { status: "SENT" },
    });
    return {
      campaignId: campaign.id,
      sent: 1,
      teamName: row.teamName,
      ageGroup: row.ageGroup,
      to,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Email send failed";
    await reconnectPrisma(prisma);
    await prisma.communicationDelivery.create({
      data: {
        campaignId: campaign.id,
        channel: "EMAIL",
        recipientType: "RAW_CONTACT",
        sourceType: `${COACH_NOTIFY_SOURCE_TYPE}_SAMPLE`,
        sourceId: row.teamId,
        toEmail: to,
        status: "FAILED",
        errorMessage: message,
        attemptedAt: new Date(),
      },
    });
    await prisma.communicationCampaign.update({
      where: { id: campaign.id },
      data: { status: "FAILED" },
    });
    throw err;
  }
}
