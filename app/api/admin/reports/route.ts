import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { fetchGames } from "@/lib/fetchGames";
import { loadFallBallPaySchedule } from "@/lib/admin/fallBallUmpirePayStore";
import { isFallBallOrg } from "@/lib/admin/fallBallUmpirePay";
import { getAssignrLeagueId, resolveAdminTargetOrg } from "@/lib/siteConfig";
import {
  buildMainReportRows,
  buildUmpireReportRows,
  gameUsesUmpires,
  matchesLeagueFilter,
  normalizeAgeGroup,
  parseLeagueFilter,
} from "@/lib/admin/umpirePayRows";

export type { LeagueFilter, MainReportRow, UmpireReportRow } from "@/lib/admin/umpirePayRows";
export {
  buildMainReportRows,
  buildUmpireReportRows,
  matchesLeagueFilter,
  normalizeAgeGroup,
  parseLeagueFilter,
};

type ReportMode = "main" | "umpire";

function parseReportMode(value: string | null): ReportMode {
  if (value === "umpire") return "umpire";
  return "main";
}

export async function GET(request: NextRequest) {
  const admin = await ensureAdminModule(request, "REPORTS");
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.message || "Unauthorized" },
      { status: admin.status },
    );
  }

  try {
    const orgId = resolveAdminTargetOrg(
      request.nextUrl.searchParams.get("org"),
    );
    const startDate = request.nextUrl.searchParams.get("startDate");
    const endDate = request.nextUrl.searchParams.get("endDate");
    const leagueFilter = parseLeagueFilter(
      request.nextUrl.searchParams.get("league"),
    );
    const mode = parseReportMode(request.nextUrl.searchParams.get("mode"));

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 },
      );
    }

    const leagueId = getAssignrLeagueId(orgId);
    const games = await fetchGames({
      startDate,
      endDate,
      leagueId,
      limit: 50,
    });

    const filteredGames = games.filter((game) => {
      const status = String(game.status || "")
        .trim()
        .toUpperCase();
      if (status === "X") return false;
      const ageGroup = normalizeAgeGroup(game.age_group as string | undefined);
      return gameUsesUmpires(ageGroup) && matchesLeagueFilter(ageGroup, leagueFilter);
    });

    const fallBallSchedule = isFallBallOrg(orgId)
      ? await loadFallBallPaySchedule({ org: orgId })
      : null;
    const payOptions = { org: orgId, fallBallSchedule };

    if (mode === "umpire") {
      const rows = buildUmpireReportRows(filteredGames, payOptions);
      const totalPay = rows.reduce((sum, row) => sum + row.totalPay, 0);
      const totalGames = rows.reduce((sum, row) => sum + row.games, 0);

      return NextResponse.json({
        data: {
          mode,
          rows,
          totals: {
            games: totalGames,
            assignments: rows.length,
            pay: totalPay,
          },
        },
      });
    }

    const rows = buildMainReportRows(filteredGames, payOptions);
    const totalPay = rows.reduce((sum, row) => sum + row.gamePayTotal, 0);

    return NextResponse.json({
      data: {
        mode,
        rows,
        totals: {
          games: rows.length,
          assignments: rows.reduce((sum, row) => sum + row.umpires.length, 0),
          pay: totalPay,
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate report: ${message}` },
      { status: 500 },
    );
  }
}
