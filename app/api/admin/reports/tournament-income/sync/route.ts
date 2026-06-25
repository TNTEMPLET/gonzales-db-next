import { NextRequest, NextResponse } from "next/server";

import { routeErrorMessage } from "@/lib/api/routeErrorMessage";
import { ensureAdminModule } from "@/lib/news/auth";
import {
  parseDateParam,
  parsePositiveInt,
  resolveTournamentIncomeOrg,
  syncTournamentIncomeFromPayPal,
} from "@/lib/tournament-income";

type SyncBody = {
  org?: string;
  organizationId?: string;
  seasonYear?: number;
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
};

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "REPORTS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    body = {};
  }

  const organizationId = resolveTournamentIncomeOrg(body.org ?? body.organizationId ?? request.nextUrl.searchParams.get("org"));
  if (!organizationId) {
    return NextResponse.json({ error: "org must be a valid bracket org" }, { status: 400 });
  }

  const startDate = parseDateParam(body.startDate ?? request.nextUrl.searchParams.get("startDate"));
  const endDate = parseDateParam(body.endDate ?? request.nextUrl.searchParams.get("endDate"));
  if (startDate && endDate && startDate > endDate) {
    return NextResponse.json({ error: "startDate must be before endDate" }, { status: 400 });
  }

  const seasonYear = Number.isFinite(body.seasonYear)
    ? Math.trunc(body.seasonYear!)
    : parsePositiveInt(request.nextUrl.searchParams.get("seasonYear"));

  try {
    const result = await syncTournamentIncomeFromPayPal({
      organizationId,
      seasonYear,
      startDate,
      endDate,
      dryRun: Boolean(body.dryRun ?? request.nextUrl.searchParams.get("dryRun") === "true"),
    });
    return NextResponse.json({ data: result });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: routeErrorMessage(err, "PayPal tournament income sync failed") },
      { status: 502 },
    );
  }
}
