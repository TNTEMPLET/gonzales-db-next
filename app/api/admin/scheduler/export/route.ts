import { type NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getSiteConfigForOrg, type ContentOrgId } from "@/lib/siteConfig";
import { exportVendorWorkbook } from "@/lib/scheduler/export";
import { jsonError, requireSchedulerAdmin, requestId, requireSeason } from "@/lib/scheduler/api";

export async function GET(request: NextRequest) {
  const auth = await requireSchedulerAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const seasonId = requestId(request, "seasonId");
    if (!seasonId) return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    const season = await requireSeason(auth.organizationId, seasonId);
    const division = request.nextUrl.searchParams.get("division") || undefined;
    const games = await prisma.scheduleDraftGame.findMany({
      where: { organizationId: auth.organizationId, seasonId, ...(division ? { division } : {}) },
      include: { park: true, field: true },
      orderBy: [{ gameDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
    });
    const leagueName = getSiteConfigForOrg(auth.organizationId as ContentOrgId).shortName;
    const workbook = exportVendorWorkbook(games, { leagueName });
    const filename = `${season.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-uploads.xlsx`;
    return new NextResponse(new Uint8Array(workbook), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
