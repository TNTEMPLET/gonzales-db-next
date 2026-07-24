import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
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
    participants: event.participants.map((p) => ({
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
      submittedAt: p.response?.submittedAt?.toISOString() ?? null,
      answers: parseAnswersJson(p.response?.answersJson),
      updatedAt: p.updatedAt.toISOString(),
    })),
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
