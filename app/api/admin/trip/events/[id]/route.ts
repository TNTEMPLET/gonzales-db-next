import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import prisma from "@/lib/prisma";
import {
  getCanonicalBallotOriginForOrganizationId,
  isContentOrgId,
} from "@/lib/siteConfig";
import {
  fieldsFromEventTemplate,
  getTripEventDetail,
  updateTripEvent,
} from "@/lib/trip/service";
import { parseAnswersJson } from "@/lib/trip/validate";

function resolveOrg(request: NextRequest): string {
  const q =
    request.nextUrl.searchParams.get("organizationId")?.trim() ||
    request.nextUrl.searchParams.get("org")?.trim();
  if (q && isContentOrgId(q)) return q;
  return resolveAuthOrganizationId(request);
}

type LastDelivery = {
  status: string;
  toEmail: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  attemptedAt: string | null;
  provider: string | null;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await context.params;
  const organizationId = resolveOrg(request);
  const event = await getTripEventDetail(id, organizationId);
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const fields = fieldsFromEventTemplate(event.template.fields);
  const baseUrl = getCanonicalBallotOriginForOrganizationId(organizationId);

  const participantIds = event.participants.map((p) => p.id);

  // Latest delivery attempt per participant (Communications audit trail)
  const lastDeliveryByParticipant = new Map<string, LastDelivery>();
  if (participantIds.length > 0) {
    const deliveries = await prisma.communicationDelivery.findMany({
      where: {
        tripParticipantId: { in: participantIds },
        channel: "EMAIL",
      },
      orderBy: [{ attemptedAt: "desc" }, { createdAt: "desc" }],
      select: {
        tripParticipantId: true,
        status: true,
        toEmail: true,
        errorMessage: true,
        sentAt: true,
        attemptedAt: true,
        provider: true,
      },
    });
    for (const d of deliveries) {
      if (!d.tripParticipantId) continue;
      if (lastDeliveryByParticipant.has(d.tripParticipantId)) continue;
      lastDeliveryByParticipant.set(d.tripParticipantId, {
        status: d.status,
        toEmail: d.toEmail,
        errorMessage: d.errorMessage,
        sentAt: d.sentAt?.toISOString() ?? null,
        attemptedAt: d.attemptedAt?.toISOString() ?? null,
        provider: d.provider,
      });
    }
  }

  const participants = event.participants.map((p) => {
    const answers = parseAnswersJson(p.response?.answersJson);
    const guardianEmail =
      (typeof answers.guardian1_email === "string" &&
        answers.guardian1_email.trim()) ||
      p.response?.submitterEmail ||
      null;
    const lastDelivery = lastDeliveryByParticipant.get(p.id) ?? null;
    const hasEmail = Boolean(guardianEmail && String(guardianEmail).trim());
    const emailed = (p.inviteEmailCount ?? 0) > 0;
    let emailStatus: "sent" | "failed" | "no_email" | "not_sent" | "suppressed" =
      "not_sent";
    if (!hasEmail) emailStatus = "no_email";
    else if (emailed || lastDelivery?.status === "SENT") emailStatus = "sent";
    else if (
      lastDelivery?.status === "SKIPPED_SUPPRESSED" ||
      lastDelivery?.status === "SKIPPED_NO_CONSENT"
    ) {
      emailStatus = "suppressed";
    } else if (
      lastDelivery &&
      (lastDelivery.status === "FAILED" ||
        lastDelivery.status.startsWith("SKIPPED"))
    ) {
      emailStatus = "failed";
    }

    return {
      id: p.id,
      playerFullName: p.playerFullName,
      ageGroup: p.ageGroup,
      team: p.team,
      jerseyNumber: p.jerseyNumber,
      status: p.status,
      inviteToken: p.inviteToken,
      inviteUrl: `${baseUrl}/trip/${p.inviteToken}`,
      submitterName: p.response?.submitterName ?? null,
      submitterEmail: p.response?.submitterEmail ?? null,
      guardianEmail,
      inviteEmailSentAt: p.inviteEmailSentAt?.toISOString() ?? null,
      inviteEmailTo: p.inviteEmailTo,
      inviteEmailCount: p.inviteEmailCount,
      emailStatus,
      lastDelivery,
      submittedAt: p.response?.submittedAt?.toISOString() ?? null,
      answers,
      updatedAt: p.updatedAt.toISOString(),
    };
  });

  const emailSummary = {
    total: participants.length,
    withEmail: participants.filter((p) => p.emailStatus !== "no_email").length,
    noEmail: participants.filter((p) => p.emailStatus === "no_email").length,
    sent: participants.filter((p) => p.emailStatus === "sent").length,
    notSent: participants.filter((p) => p.emailStatus === "not_sent").length,
    failed: participants.filter((p) => p.emailStatus === "failed").length,
    suppressed: participants.filter((p) => p.emailStatus === "suppressed")
      .length,
  };

  return NextResponse.json({
    event: {
      id: event.id,
      name: event.name,
      teamLabel: event.teamLabel,
      status: event.status,
      googleSheetId: event.googleSheetId,
      googleSheetUrl: event.googleSheetUrl,
      introMarkdown: event.introMarkdown,
      ballotCycleId: event.ballotCycleId,
      opensAt: event.opensAt?.toISOString() ?? null,
      closesAt: event.closesAt?.toISOString() ?? null,
      organizationId: event.organizationId,
      template: {
        id: event.template.id,
        key: event.template.key,
        name: event.template.name,
      },
      fields,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    },
    participants,
    emailSummary,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await context.params;
  const organizationId = resolveOrg(request);

  let body: {
    name?: string;
    teamLabel?: string | null;
    status?: string;
    googleSheetId?: string | null;
    googleSheetUrl?: string | null;
    introMarkdown?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.status && !["draft", "open", "closed"].includes(body.status)) {
    return NextResponse.json(
      { error: "status must be draft, open, or closed" },
      { status: 400 },
    );
  }

  const updated = await updateTripEvent(id, organizationId, body);
  if (!updated) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({
    event: {
      id: updated.id,
      name: updated.name,
      teamLabel: updated.teamLabel,
      status: updated.status,
      googleSheetId: updated.googleSheetId,
      googleSheetUrl: updated.googleSheetUrl,
      introMarkdown: updated.introMarkdown,
    },
  });
}
