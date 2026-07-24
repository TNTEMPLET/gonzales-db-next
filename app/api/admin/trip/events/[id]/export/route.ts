import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import {
  getCanonicalBallotOriginForOrganizationId,
  isContentOrgId,
} from "@/lib/siteConfig";
import { buildTripExportCsv } from "@/lib/trip/export";
import {
  fieldsFromEventTemplate,
  getTripEventDetail,
} from "@/lib/trip/service";

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
  const sheetOnly =
    request.nextUrl.searchParams.get("sheetOnly") !== "0" &&
    request.nextUrl.searchParams.get("sheetOnly") !== "false";
  const includeInviteUrl =
    request.nextUrl.searchParams.get("inviteUrls") === "1" ||
    request.nextUrl.searchParams.get("inviteUrls") === "true";
  const submittedOnly =
    request.nextUrl.searchParams.get("submittedOnly") === "1" ||
    request.nextUrl.searchParams.get("submittedOnly") === "true";

  const baseUrl = getCanonicalBallotOriginForOrganizationId(organizationId);

  let participants = event.participants;
  if (submittedOnly) {
    participants = participants.filter((p) => p.status === "submitted");
  }

  const csv = buildTripExportCsv({
    fields,
    rows: participants.map((p) => ({
      playerFullName: p.playerFullName,
      ageGroup: p.ageGroup,
      team: p.team,
      jerseyNumber: p.jerseyNumber,
      status: p.status,
      submitterName: p.response?.submitterName ?? null,
      submitterEmail: p.response?.submitterEmail ?? null,
      submitterPhone: p.response?.submitterPhone ?? null,
      submittedAt: p.response?.submittedAt ?? null,
      answersJson: p.response?.answersJson ?? null,
      inviteToken: p.inviteToken,
    })),
    sheetOnly,
    includeInviteUrl,
    inviteBaseUrl: baseUrl,
  });

  const safeName = event.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60);
  const filename = `trip-${safeName}-${sheetOnly ? "sheet" : "full"}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
