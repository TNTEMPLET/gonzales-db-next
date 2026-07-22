import { NextRequest, NextResponse } from "next/server";
import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import {
  buildShirtOrdersCsv,
  type ShirtOrdersExportOrg,
} from "@/lib/merch/shirtOrdersExport";

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(request.url);
  const orgParam = url.searchParams.get("org") ?? "all";
  const orgFilter: ShirtOrdersExportOrg =
    orgParam === "gonzales" || orgParam === "ascension" ? orgParam : "all";
  const openOnly = url.searchParams.get("open") === "1";

  const result = await buildShirtOrdersCsv({ orgFilter, openOnly });

  return new NextResponse(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
}
