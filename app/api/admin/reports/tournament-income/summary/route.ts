import { NextRequest, NextResponse } from "next/server";

import { routeErrorMessage } from "@/lib/api/routeErrorMessage";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import {
  filtersFromSearchParams,
  summarizeTournamentIncome,
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
      orderBy: [{ paypalTxDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    return NextResponse.json({
      data: {
        filters: parsed.filters,
        transactions: rows,
        summary: summarizeTournamentIncome(rows),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: routeErrorMessage(err, "Failed to load tournament income summary") },
      { status: 500 },
    );
  }
}
