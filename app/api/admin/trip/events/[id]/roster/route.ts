import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import {
  getCanonicalBallotOriginForOrganizationId,
  getSiteConfigForOrg,
  isContentOrgId,
  type OrgId,
} from "@/lib/siteConfig";
import {
  buildRosterHtml,
  buildRosterPdf,
} from "@/lib/trip/rosterSheet";
import { getTripEventDetail } from "@/lib/trip/service";

function resolveOrg(request: NextRequest): string {
  const q =
    request.nextUrl.searchParams.get("organizationId")?.trim() ||
    request.nextUrl.searchParams.get("org")?.trim();
  if (q && isContentOrgId(q)) return q;
  return resolveAuthOrganizationId(request);
}

/**
 * Printable travel roster (HTML or PDF).
 * Shows Jersey # + Player Name for all trip participants,
 * plus the fixed coaching staff for SW Regionals.
 *
 * Query:
 *   format=html|pdf (default html)
 */
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

  const format = (request.nextUrl.searchParams.get("format") || "html").toLowerCase();

  const site = getSiteConfigForOrg(
    (isContentOrgId(organizationId)
      ? organizationId
      : "master") as OrgId,
  );
  const baseUrl = getCanonicalBallotOriginForOrganizationId(organizationId);
  const logoAbsoluteUrl = `${baseUrl}${site.logoPath.startsWith("/") ? "" : "/"}${site.logoPath}`;

  const org = {
    name: site.name,
    shortName: site.shortName,
    logoPath: site.logoPath,
    logoAbsoluteUrl,
  };
  const eventMeta = {
    name: event.name,
    teamLabel: event.teamLabel,
  };

  // Map participants to the minimal shape needed for the roster (jersey + name).
  const rows = event.participants.map((p) => ({
    playerFullName: p.playerFullName,
    jerseyNumber: p.jerseyNumber,
    status: p.status,
    answersJson: p.response?.answersJson ?? null,
  }));

  const safeName = event.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 50);

  if (format === "pdf") {
    const pdf = await buildRosterPdf({
      org,
      event: eventMeta,
      participants: rows,
    });
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="roster-${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const html = buildRosterHtml({
    org,
    event: eventMeta,
    participants: rows,
  });
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
