import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import {
  recommendedLoadOrder,
  SPORTS_CONNECT_REPORT_CATALOG,
} from "@/lib/sportsConnect/reportCatalog";

export const dynamic = "force-dynamic";

/** Report checklist for Master Admin SportsConnect-assisted loads. */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  return NextResponse.json(
    {
      data: SPORTS_CONNECT_REPORT_CATALOG,
      loadOrder: recommendedLoadOrder(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
