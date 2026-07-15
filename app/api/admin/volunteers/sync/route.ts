import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";
import { syncCoachesToVolunteers } from "@/lib/volunteers/service";

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  try {
    const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const body = (await request.json().catch(() => ({}))) as { seasonYear?: number };
    const seasonYear =
      body.seasonYear ?? getSeasonConfigForOrg(organizationId as ContentOrgId).year;
    const result = await syncCoachesToVolunteers(organizationId, seasonYear);
    return NextResponse.json({ success: true, ...result, seasonYear, organizationId });
  } catch (err: unknown) {
    console.error("[admin/volunteers/sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
