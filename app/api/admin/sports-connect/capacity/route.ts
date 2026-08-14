import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { getFallBallCapacityReport } from "@/lib/sportsConnect/fallballCapacity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/sports-connect/capacity
 * Fall Ball division enrollment + matched-coach capacity, from real roster data.
 */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const report = await getFallBallCapacityReport();
    return NextResponse.json({ ok: true, data: report });
  } catch (err) {
    console.error("[api/admin/sports-connect/capacity]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load capacity data" },
      { status: 500 },
    );
  }
}
