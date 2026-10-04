import { NextRequest, NextResponse } from "next/server";

import { isSpringCombinedParam } from "@/lib/admin/springCombined/view";
import { forecastAuthFailure, forecastReaders, runDivisionForecast, runSpringCombinedForecast } from "@/lib/ageDivisions/forecastData";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Read-only division forecast. Nothing here writes, and the body is counts only. */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "DIVISION_AGES");
  const denied = forecastAuthFailure(auth);
  if (denied || !auth.ok) {
    return NextResponse.json(denied?.body ?? { error: "Unauthorized" }, { status: denied?.status ?? 401 });
  }

  const requestedOrg = request.nextUrl.searchParams.get("org");
  if (isSpringCombinedParam(requestedOrg)) {
    if (!auth.admin.isMaster || !isMasterDeployment()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await runSpringCombinedForecast({ readJson: () => request.json() }, await forecastReaders());
    return NextResponse.json(result.body, { status: result.status });
  }

  const result = await runDivisionForecast(
    {
      org: resolveAdminTargetOrg(requestedOrg),
      readJson: () => request.json(),
    },
    await forecastReaders(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
