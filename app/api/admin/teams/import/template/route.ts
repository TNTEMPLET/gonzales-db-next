import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const csv = [
    "Program Name,Division Name,Team Name,Player First Name,Player Last Name,Player Telephone,Roster Status,Jersey Number",
    "2026 Gonzales DYB Spring Season,11/12 year-old DYB,Abbot and Prescott - Higgins,Tyler,Kelley,225-571-3171,Active,14",
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="teams-player-import-template.csv"',
    },
  });
}
