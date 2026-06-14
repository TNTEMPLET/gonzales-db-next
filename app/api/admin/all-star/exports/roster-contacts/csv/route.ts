import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import { buildAllStarExportFilename } from "@/lib/allStar/exportFormat";
import {
  buildRosterContactRows,
  rosterContactRowsToCsv,
} from "@/lib/allStar/rosterContactExport";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { CONTENT_ORGS, isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId")?.trim() || undefined;
  const orgParam = request.nextUrl.searchParams.get("organizationId")?.trim()
    || request.nextUrl.searchParams.get("org")?.trim()
    || undefined;
  const seasonYearParam = request.nextUrl.searchParams.get("seasonYear")?.trim();
  const seasonYear = seasonYearParam ? Number.parseInt(seasonYearParam, 10) : undefined;

  if (!cycleId && !orgParam) {
    return NextResponse.json(
      { error: "cycleId or organizationId is required" },
      { status: 400 },
    );
  }

  const adminUser = await getAdminUserFromRequest(request);
  let organizationId: ContentOrgId | undefined;

  if (cycleId) {
    const cycle = await prisma.allStarBallotCycle.findUnique({
      where: { id: cycleId },
      select: { organizationId: true, title: true, seasonYear: true, ageGroup: true },
    });
    if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

    if (!adminUser?.isMaster) {
      const authOrg = resolveAuthOrganizationId(request);
      if (cycle.organizationId !== authOrg) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } else {
    if (!orgParam || !isContentOrgId(orgParam)) {
      return NextResponse.json(
        { error: `organizationId must be one of: ${CONTENT_ORGS.join(", ")}` },
        { status: 400 },
      );
    }
    organizationId = orgParam;
    if (!adminUser?.isMaster) {
      const authOrg = resolveAuthOrganizationId(request);
      if (organizationId !== authOrg) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    if (seasonYearParam && (!Number.isFinite(seasonYear) || seasonYear! < 2000)) {
      return NextResponse.json({ error: "seasonYear must be a valid year" }, { status: 400 });
    }
  }

  const rows = await buildRosterContactRows(prisma, {
    cycleId,
    organizationId,
    seasonYear: Number.isFinite(seasonYear) ? seasonYear : undefined,
  });

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No finalized All-Star roster players found for this export." },
      { status: 404 },
    );
  }

  const csv = rosterContactRowsToCsv(rows);

  let filenameBase = "all-star-roster-contacts";
  if (cycleId) {
    const cycle = await prisma.allStarBallotCycle.findUnique({
      where: { id: cycleId },
      select: { title: true, seasonYear: true, ageGroup: true, organizationId: true },
    });
    if (cycle) {
      filenameBase = buildAllStarExportFilename(
        cycle.title?.trim() || `${cycle.seasonYear} ${cycle.ageGroup}`,
        cycle.organizationId,
        "roster-contacts",
      );
    }
  } else if (organizationId) {
    filenameBase = buildAllStarExportFilename(
      organizationId,
      seasonYear ? String(seasonYear) : "all-years",
      "roster-contacts",
    );
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
    },
  });
}
