import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { isContentOrgId } from "@/lib/siteConfig";
import {
  createTripEvent,
  listTripEventsForOrg,
  summarizeParticipantStatuses,
} from "@/lib/trip/service";
import {
  ensureSwRegionalTemplate,
  SW_REGIONAL_TEMPLATE_KEY,
} from "@/lib/trip/templates";
import prisma from "@/lib/prisma";

function resolveOrg(request: NextRequest): string {
  const q =
    request.nextUrl.searchParams.get("organizationId")?.trim() ||
    request.nextUrl.searchParams.get("org")?.trim();
  if (q && isContentOrgId(q)) return q;
  return resolveAuthOrganizationId(request);
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const organizationId = resolveOrg(request);
  // Keep SW Regional field defs in sync (health section, etc.)
  await ensureSwRegionalTemplate();
  const events = await listTripEventsForOrg(organizationId);

  return NextResponse.json({
    organizationId,
    events: events.map((e) => {
      const summary = summarizeParticipantStatuses(e.participants);
      return {
        id: e.id,
        name: e.name,
        teamLabel: e.teamLabel,
        status: e.status,
        googleSheetId: e.googleSheetId,
        googleSheetUrl: e.googleSheetUrl,
        template: e.template,
        participantCount: e._count.participants,
        summary,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let body: {
    organizationId?: string;
    name?: string;
    teamLabel?: string | null;
    status?: string;
    templateKey?: string;
    googleSheetId?: string | null;
    googleSheetUrl?: string | null;
    introMarkdown?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const organizationId =
    (body.organizationId && isContentOrgId(body.organizationId)
      ? body.organizationId
      : null) || resolveOrg(request);

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const templateKey = body.templateKey?.trim() || SW_REGIONAL_TEMPLATE_KEY;
  let template =
    templateKey === SW_REGIONAL_TEMPLATE_KEY
      ? await ensureSwRegionalTemplate()
      : await prisma.tripFieldTemplate.findUnique({ where: { key: templateKey } });

  if (!template) {
    return NextResponse.json(
      { error: `Template not found: ${templateKey}` },
      { status: 404 },
    );
  }

  const status = body.status?.trim() || "draft";
  if (!["draft", "open", "closed"].includes(status)) {
    return NextResponse.json(
      { error: "status must be draft, open, or closed" },
      { status: 400 },
    );
  }

  const event = await createTripEvent({
    organizationId,
    templateId: template.id,
    name,
    teamLabel: body.teamLabel,
    status,
    googleSheetId: body.googleSheetId,
    googleSheetUrl: body.googleSheetUrl,
    introMarkdown: body.introMarkdown,
  });

  return NextResponse.json({ event }, { status: 201 });
}
