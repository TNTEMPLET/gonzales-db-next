import { NextRequest, NextResponse } from "next/server";

import { forecastAuthFailure, forecastReaders, runDivisionForecast } from "@/lib/ageDivisions/forecastData";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Read-only division forecast. Nothing here writes, and the body is counts only. */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "DIVISION_AGES");
  const denied = forecastAuthFailure(auth);
  if (denied) return NextResponse.json(denied.body, { status: denied.status });

  const result = await runDivisionForecast(
    {
      org: resolveAdminTargetOrg(request.nextUrl.searchParams.get("org")),
      readJson: () => request.json(),
    },
    await forecastReaders(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
