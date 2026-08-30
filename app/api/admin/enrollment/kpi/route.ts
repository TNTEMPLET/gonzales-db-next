import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { getEnrollmentKpiSummary } from "@/lib/enrollment/kpi";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { isContentOrgId, resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/enrollment/kpi
 * Enrollment source-of-truth KPI summary (registration counts, revenue
 * collected/outstanding, fee-tier breakdown, net due after CC/online fees,
 * per-division rollup) — see lib/enrollment/kpi.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "ENROLLMENT_KPI");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json(
      { error: "Select a concrete site (not All Sites) to view enrollment KPIs." },
      { status: 400 },
    );
  }

  const seasonParam = request.nextUrl.searchParams.get("seasonYear");
  const parsed = seasonParam ? Number(seasonParam) : Number.NaN;
  const seasonYear = Number.isFinite(parsed)
    ? parsed
    : getSeasonConfigForOrg(targetOrg as ContentOrgId).year;

  try {
    const summary = await getEnrollmentKpiSummary({ organizationId: targetOrg, seasonYear });
    return NextResponse.json(
      { data: summary },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load enrollment KPIs";
    console.error("[enrollment/kpi]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
