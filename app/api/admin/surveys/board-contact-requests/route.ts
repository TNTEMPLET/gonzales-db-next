import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule, isMasterAdminActor } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";
import {
  getBoardContactRequests,
  setBoardContactRequestContacted,
} from "@/lib/surveys/boardContactRequests";

export const dynamic = "force-dynamic";

/**
 * Cross-survey Board Contact Requests -- same "TEAMS" module gate as the
 * rest of the survey admin routes (see app/api/admin/surveys/[id]/results/route.ts).
 */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const respondentOrganizationId = request.nextUrl.searchParams.get("respondentOrg");
  const seasonParam = request.nextUrl.searchParams.get("seasonYear");
  const seasonYear = seasonParam ? Number(seasonParam) : null;
  const onlyOpen = request.nextUrl.searchParams.get("onlyOpen") === "true";

  try {
    const requests = await getBoardContactRequests({
      // Master admins can see across every org's surveys; everyone else is
      // locked to the org ensureAdminModule already validated them against.
      surveyOrganizationId: isMasterAdminActor(auth) ? null : auth.orgId,
      respondentOrganizationId,
      seasonYear: Number.isFinite(seasonYear) ? seasonYear : null,
      onlyOpen,
    });
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Error loading board contact requests:", error);
    return NextResponse.json({ error: "Failed to load board contact requests" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { responseId, contacted } = body as { responseId?: string; contacted?: boolean };
    if (!responseId || typeof contacted !== "boolean") {
      return NextResponse.json({ error: "responseId and contacted are required" }, { status: 400 });
    }

    // Confirm this response belongs to a survey the caller can actually see
    // before writing -- ensureAdminModule only validated auth.orgId itself,
    // not that this specific responseId lives inside it.
    const response = await prisma.surveyResponse.findUnique({
      where: { id: responseId },
      select: { survey: { select: { organizationId: true } } },
    });
    if (!response) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!isMasterAdminActor(auth) && response.survey.organizationId !== auth.orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await setBoardContactRequestContacted({
      responseId,
      contacted,
      adminId: auth.admin.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating board contact request:", error);
    return NextResponse.json({ error: "Failed to update request" }, { status: 500 });
  }
}
