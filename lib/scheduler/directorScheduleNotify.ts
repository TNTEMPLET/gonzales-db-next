import type { Prisma } from "@prisma/client";

import { isCommunicationsModuleEnabled } from "@/lib/communications/config";
import { getDefaultFromAddress } from "@/lib/communications/fromAddresses";
import { sendEmailViaResend } from "@/lib/communications/providers/resend";
import { isEmailSuppressed } from "@/lib/communications/suppression";
import { createUnsubscribeToken } from "@/lib/communications/unsubscribeToken";
import prisma from "@/lib/prisma";
import { reconnectPrisma } from "@/lib/prismaRetry";
import { getOrgDisplayName, getSiteConfigForOrg, type ContentOrgId } from "@/lib/siteConfig";
import { buildDirectorScheduleAttachments } from "@/lib/scheduler/directorScheduleAttachments";
import {
  DIRECTOR_NOTIFY_SOURCE_TYPE,
  buildDirectorScheduleEmail,
  directorParksFromGames,
  filterDirectorGames,
  parseDirectorEmails,
  parseDirectorNotifyState,
  toDirectorScheduleGame,
  withDirectorNotifyState,
  type DirectorNotifyPayload,
} from "@/lib/scheduler/directorScheduleEmail";
import { formatNotifyDate } from "@/lib/scheduler/coachScheduleEmail";
import { parseSeasonDateWindows } from "@/lib/scheduler/seasonWindows";
import { dateKey } from "@/lib/scheduler/validation";

export type { DirectorNotifyPayload } from "@/lib/scheduler/directorScheduleEmail";

function windowLabel(start: string, end: string): string {
  const left = formatNotifyDate(start);
  const right = formatNotifyDate(end);
  if (!left && !right) return "";
  return `${left || "—"} – ${right || "—"}`;
}

export async function loadDirectorScheduleNotify(params: {
  organizationId: string;
  seasonId: string;
}): Promise<DirectorNotifyPayload> {
  const season = await prisma.scheduleSeason.findFirst({
    where: { id: params.seasonId, organizationId: params.organizationId },
  });
  if (!season) {
    throw new Error("Schedule season was not found");
  }

  const games = await prisma.scheduleDraftGame.findMany({
    where: {
      organizationId: params.organizationId,
      seasonId: season.id,
      NOT: { status: "CANCELED" },
    },
    include: { park: { select: { id: true, name: true } }, field: { select: { id: true, name: true } } },
    orderBy: [{ gameDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
  });

  const placed = games
    .filter((game) => Boolean(game.gameDate && game.startTime && game.homeTeamName && game.awayTeamName))
    .map((game) =>
      toDirectorScheduleGame({
        parkId: game.parkId,
        parkName: game.park?.name ?? null,
        fieldId: game.fieldId,
        fieldName: game.field?.name ?? null,
        division: game.division,
        ageGroup: game.ageGroup,
        gameDate: game.gameDate,
        startTime: game.startTime,
        homeTeamName: game.homeTeamName,
        awayTeamName: game.awayTeamName,
      }),
    );

  const org = params.organizationId as ContentOrgId;
  const seasonStart = season.startsOn ? dateKey(season.startsOn) : "";
  const seasonEnd = season.endsOn ? dateKey(season.endsOn) : "";
  const windows = parseSeasonDateWindows(season.settings, seasonStart, seasonEnd);
  const lastSent = parseDirectorNotifyState(season.settings);

  return {
    parks: directorParksFromGames(placed),
    games: placed,
    gameCount: placed.length,
    lastSentAt: lastSent.lastSentAt,
    lastSentCount: lastSent.lastSentCount,
    lastCampaignId: lastSent.lastCampaignId,
    seasonName: season.name,
    orgName: getOrgDisplayName(org),
    gamesWindow: windowLabel(windows.gamesStartsOn, windows.gamesEndsOn),
  };
}

export async function sendDirectorScheduleEmails(params: {
  organizationId: string;
  seasonId: string;
  emails: string[] | string;
  parkIds: string[] | null;
  actorAdminId: string | null;
  replyTo?: string | null;
  sample?: boolean;
}): Promise<{
  campaignId: string | null;
  sent: number;
  failed: number;
  skipped: number;
  readyCount: number;
  gameCount: number;
  subject: string;
}> {
  if (!isCommunicationsModuleEnabled()) {
    throw new Error("Communications module is disabled");
  }

  const parsed = Array.isArray(params.emails)
    ? parseDirectorEmails(params.emails.join("\n"))
    : parseDirectorEmails(params.emails);
  if (!parsed.emails.length) {
    throw new Error("Enter at least one director email");
  }

  const payload = await loadDirectorScheduleNotify({
    organizationId: params.organizationId,
    seasonId: params.seasonId,
  });
  const selectedParkIds = params.parkIds?.length ? params.parkIds : payload.parks.map((park) => park.parkId);
  const games = filterDirectorGames(payload.games, selectedParkIds);
  if (!games.length) {
    throw new Error("No placed games in the selected parks");
  }

  const pending: string[] = [];
  let skipped = parsed.skipped;
  for (const email of parsed.emails) {
    if (await isEmailSuppressed(email, params.organizationId)) {
      skipped += 1;
      continue;
    }
    pending.push(email);
  }
  if (!pending.length) {
    return {
      campaignId: null,
      sent: 0,
      failed: 0,
      skipped,
      readyCount: 0,
      gameCount: games.length,
      subject: "",
    };
  }

  const season = await prisma.scheduleSeason.findFirstOrThrow({
    where: { id: params.seasonId, organizationId: params.organizationId },
  });
  const email = buildDirectorScheduleEmail({
    orgName: payload.orgName,
    seasonName: payload.seasonName,
    games,
    gamesWindow: payload.gamesWindow,
  });
  const attachments = buildDirectorScheduleAttachments({
    seasonName: payload.seasonName,
    orgName: payload.orgName,
    gamesWindow: payload.gamesWindow,
    games,
  });
  const fromAddress = await getDefaultFromAddress();
  const campaign = await prisma.communicationCampaign.create({
    data: {
      organizationId: params.organizationId,
      logicalMode: "AND",
      channels: ["EMAIL"],
      status: "SENDING",
      title: `${params.sample ? "Director schedule sample" : "Director schedules"}: ${season.name}`.slice(0, 200),
      messageSubject: email.subject,
      messageBody: email.text,
      fromEmail: fromAddress,
      createdByAdminId: params.actorAdminId,
      sentAt: new Date(),
      audienceRules: {
        create: [
          {
            ruleType: "EXPLICIT_CONTACTS",
            organizationId: params.organizationId,
            explicitContacts: pending.map((to) => ({
              email: to,
              sourceType: params.sample ? `${DIRECTOR_NOTIFY_SOURCE_TYPE}_SAMPLE` : DIRECTOR_NOTIFY_SOURCE_TYPE,
              sourceId: params.seasonId,
            })),
          },
        ],
      },
    },
  });

  await prisma.communicationRecipientSnapshot.createMany({
    data: pending.map((to) => ({
      campaignId: campaign.id,
      recipientType: "RAW_CONTACT" as const,
      sourceType: params.sample ? `${DIRECTOR_NOTIFY_SOURCE_TYPE}_SAMPLE` : DIRECTOR_NOTIFY_SOURCE_TYPE,
      sourceId: params.seasonId,
      email: to,
      matchReasons: params.sample ? ["DIRECTOR_SAMPLE"] : ["DIRECTOR"],
    })),
  });

  type Delivery = {
    email: string;
    status: "SENT" | "FAILED";
    errorMessage?: string;
    provider?: string;
    providerMessageId?: string | null;
  };
  const results: Delivery[] = [];
  const appBase = process.env.NEXT_PUBLIC_APP_URL || getSiteConfigForOrg(params.organizationId as ContentOrgId).siteUrl;
  const paceMs = 120;

  for (let i = 0; i < pending.length; i++) {
    const to = pending[i]!;
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, paceMs));
    const unsubscribeToken = createUnsubscribeToken({
      email: to,
      organizationId: params.organizationId,
      channel: "EMAIL",
    });
    const unsubUrl =
      appBase && unsubscribeToken
        ? `${appBase.replace(/\/$/, "")}/api/admin/communications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
        : null;
    const html = `${email.html}${
      unsubUrl
        ? `<hr/><p style="font-size:12px;color:#666">Unsubscribe: <a href="${unsubUrl}">${unsubUrl}</a></p>`
        : ""
    }`;
    try {
      const provider = await sendEmailViaResend({
        to,
        subject: email.subject,
        html,
        text: email.text,
        from: fromAddress,
        replyTo: params.replyTo,
        attachments,
      });
      results.push({
        email: to,
        status: "SENT",
        provider: provider.provider,
        providerMessageId: provider.providerMessageId,
      });
    } catch (err: unknown) {
      results.push({
        email: to,
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
        recipientType: "RAW_CONTACT" as const,
        sourceType: params.sample ? `${DIRECTOR_NOTIFY_SOURCE_TYPE}_SAMPLE` : DIRECTOR_NOTIFY_SOURCE_TYPE,
        sourceId: params.seasonId,
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

  if (sent > 0 && !params.sample) {
    await prisma.scheduleSeason.update({
      where: { id: season.id },
      data: {
        settings: withDirectorNotifyState(season.settings, {
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
    skipped,
    readyCount: pending.length,
    gameCount: games.length,
    subject: email.subject,
  };
}
