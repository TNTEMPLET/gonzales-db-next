import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { isCommunicationsModuleEnabled } from "@/lib/communications/config";
import { isContentOrgId } from "@/lib/siteConfig";
import {
  previewTripInviteRecipients,
  sendTripInviteEmails,
} from "@/lib/trip/inviteEmail";

/** Bulk Resend + DB audit can exceed default serverless limit. */
export const maxDuration = 60;
export const runtime = "nodejs";

function resolveOrg(request: NextRequest): string {
  const q =
    request.nextUrl.searchParams.get("organizationId")?.trim() ||
    request.nextUrl.searchParams.get("org")?.trim();
  if (q && isContentOrgId(q)) return q;
  return resolveAuthOrganizationId(request);
}

/** Preview guardians + emails for trip invite send. */
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

  try {
    const preview = await previewTripInviteRecipients(id, organizationId);
    return NextResponse.json({
      ...preview,
      communicationsEnabled: isCommunicationsModuleEnabled(),
      resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Preview failed";
    const status = msg === "Event not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** Send personalized trip invite emails (Resend + Communications audit campaign). */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  if (!isCommunicationsModuleEnabled()) {
    return NextResponse.json(
      { error: "Communications module is disabled" },
      { status: 404 },
    );
  }

  const { id } = await context.params;
  const organizationId = resolveOrg(request);
  const admin = await getAdminUserFromRequest(request);

  let body: {
    participantIds?: string[];
    resend?: boolean;
    subjectTemplate?: string;
    bodyTemplate?: string;
    fromEmail?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const result = await sendTripInviteEmails({
      eventId: id,
      organizationId,
      participantIds: body.participantIds,
      resend: Boolean(body.resend),
      subjectTemplate: body.subjectTemplate,
      bodyTemplate: body.bodyTemplate,
      fromEmail: body.fromEmail,
      createdByAdminId: admin?.id ?? null,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const err = e as Error & {
      status?: number;
      sent?: number;
      failed?: number;
      campaignId?: string;
    };
    let message = err.message || "Send failed";
    if (message.includes("WebSocket is not connected")) {
      message =
        "Database connection dropped while sending (Prisma Postgres WebSocket). " +
        "Some emails may already have been delivered — check parent inboxes before resending. " +
        "Refresh the page and try again with “Resend” only for players still marked not emailed.";
    }
    const status =
      err.status ??
      (err.message === "Event not found"
        ? 404
        : message.includes("WebSocket")
          ? 502
          : 400);
    return NextResponse.json(
      {
        error: message,
        sent: err.sent,
        failed: err.failed,
        campaignId: err.campaignId,
      },
      { status },
    );
  }
}
