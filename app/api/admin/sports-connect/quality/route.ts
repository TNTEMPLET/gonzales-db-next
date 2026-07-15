import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { getRosterQualitySummary } from "@/lib/sportsConnect/quality";
import {
  isContentOrgId,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json(
      { error: "Select a concrete site (not All Sites) to view roster quality." },
      { status: 400 },
    );
  }

  const seasonParam = request.nextUrl.searchParams.get("seasonYear");
  const parsed = seasonParam ? Number(seasonParam) : Number.NaN;
  const seasonYear = Number.isFinite(parsed)
    ? parsed
    : getSeasonConfigForOrg(targetOrg as ContentOrgId).year;

  try {
    const summary = await getRosterQualitySummary({
      organizationId: targetOrg,
      seasonYear,
    });
    return NextResponse.json(
      { data: summary },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load roster quality";
    console.error("[sports-connect/quality]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
