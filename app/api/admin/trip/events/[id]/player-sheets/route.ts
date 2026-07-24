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
  buildPlayerSheetsHtml,
  buildPlayerSheetsPdf,
} from "@/lib/trip/playerSheet";
import { getTripEventDetail } from "@/lib/trip/service";

function resolveOrg(request: NextRequest): string {
  const q =
    request.nextUrl.searchParams.get("organizationId")?.trim() ||
    request.nextUrl.searchParams.get("org")?.trim();
  if (q && isContentOrgId(q)) return q;
  return resolveAuthOrganizationId(request);
}

/**
 * Printable coach binder player sheets (HTML or PDF).
 * Includes health — league admin / coaching staff only; never director CSV.
 *
 * Query:
 *   format=html|pdf (default html)
 *   layout=full|cards (html only; default full = 1 page/player)
 *   ids=id1,id2 (optional participant filter)
 *   submittedOnly=1
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
  const layoutParam = request.nextUrl.searchParams.get("layout") || "full";
  const layout = layoutParam === "cards" ? "cards" : "full";
  const submittedOnly =
    request.nextUrl.searchParams.get("submittedOnly") === "1" ||
    request.nextUrl.searchParams.get("submittedOnly") === "true";
  const idsParam = request.nextUrl.searchParams.get("ids")?.trim();
  const idSet = idsParam
    ? new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  let participants = event.participants;
  if (idSet) {
    participants = participants.filter((p) => idSet.has(p.id));
  }
  if (submittedOnly) {
    participants = participants.filter((p) => p.status === "submitted");
  }

  if (participants.length === 0) {
    return NextResponse.json(
      { error: "No participants match the filter" },
      { status: 404 },
    );
  }

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
  const rows = participants.map((p) => ({
    playerFullName: p.playerFullName,
    ageGroup: p.ageGroup,
    team: p.team,
    jerseyNumber: p.jerseyNumber,
    status: p.status,
    answersJson: p.response?.answersJson ?? null,
  }));

  const safeName = event.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 50);

  if (format === "pdf") {
    const pdf = await buildPlayerSheetsPdf({
      org,
      event: eventMeta,
      participants: rows,
    });
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="player-sheets-${safeName}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const html = buildPlayerSheetsHtml({
    org,
    event: eventMeta,
    participants: rows,
    layout,
  });
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
