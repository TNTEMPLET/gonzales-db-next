import { NextRequest, NextResponse } from "next/server";

import { routeErrorMessage } from "@/lib/api/routeErrorMessage";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import {
  exportTournamentIncomeCsv,
  filtersFromSearchParams,
  tournamentIncomeCsvFilename,
  whereFromFilters,
} from "@/lib/tournament-income";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "REPORTS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const parsed = filtersFromSearchParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const rows = await prisma.tournamentIncomeTransaction.findMany({
      where: whereFromFilters(parsed.filters),
      orderBy: [{ paypalTxDate: "asc" }, { createdAt: "asc" }],
    });
    const csv = exportTournamentIncomeCsv(rows);
    const filename = tournamentIncomeCsvFilename({
      organizationId: parsed.filters.organizationId,
      seasonYear: parsed.filters.seasonYear,
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: routeErrorMessage(err, "Failed to export tournament income") },
      { status: 500 },
    );
  }
}
