import { NextRequest, NextResponse } from "next/server";

import { ensureNewsAdmin } from "@/lib/news/auth";
import { fetchGames, type Game } from "@/lib/fetchGames";
import { getAssignrLeagueId, resolveAdminTargetOrg } from "@/lib/siteConfig";

type LeagueFilter = "all" | "littleleague" | "diamond";
type ReportMode = "main" | "umpire";

type Assignment = {
  officialId: string;
  name: string;
};

type MainReportRow = {
  gameId: string;
  date: string;
  time: string;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  subvenue: string;
  status: string;
  umpireCount: number;
  gamePayTotal: number;
};

type UmpireReportRow = {
  park: string;
  date: string;
  umpireId: string;
  umpireName: string;
  games: number;
  totalPay: number;
};

const PAY_RATE_BY_AGE: Record<number, number> = {
  6: 40,
  7: 40,
  8: 40,
  9: 50,
  10: 50,
  11: 60,
  12: 60,
  13: 70,
  14: 70,
  15: 80,
  16: 80,
  17: 80,
};

function parseLeagueFilter(value: string | null): LeagueFilter {
  if (value === "littleleague" || value === "diamond") return value;
  return "all";
}

function parseReportMode(value: string | null): ReportMode {
  if (value === "umpire") return "umpire";
  return "main";
}

function normalizeAgeGroup(value: string | undefined): string {
  return (value || "Unassigned").trim() || "Unassigned";
}

function getGameStatusLabel(status: string | undefined): string {
  if (status === "A") return "Assigned";
  if (status === "C") return "Cancelled";
  if (status === "F") return "Final";
  return (status || "Scheduled").trim() || "Scheduled";
}

function toDateLabel(value: string | undefined): string {
  if (!value) return "Date TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Date TBD";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toTimeLabel(value: string | undefined): string {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "TBD";
  return parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isLittleLeagueAgeGroup(ageGroup: string): boolean {
  const normalized = ageGroup.toUpperCase();
  return (
    normalized.includes("LLB") ||
    normalized.includes("LITTLE LEAGUE") ||
    normalized.includes(" ASCENSION")
  );
}

function isDiamondAgeGroup(ageGroup: string): boolean {
  const normalized = ageGroup.toUpperCase();
  return (
    normalized.includes("DYB") ||
    normalized.includes("DBB") ||
    normalized.includes("DPM") ||
    normalized.includes("DIAMOND") ||
    normalized.includes("DIXIE")
  );
}

function matchesLeagueFilter(ageGroup: string, filter: LeagueFilter): boolean {
  if (filter === "all") return true;
  if (filter === "littleleague") return isLittleLeagueAgeGroup(ageGroup);
  return isDiamondAgeGroup(ageGroup);
}

function extractAssignments(game: Game): Assignment[] {
  const embedded = game._embedded as
    | {
        assignments?: Array<{
          _embedded?: {
            official?: {
              id?: string | number;
              first_name?: string;
              last_name?: string;
            };
          };
        }>;
      }
    | undefined;

  const source = embedded?.assignments || [];
  const assignments: Assignment[] = [];

  for (const entry of source) {
    const official = entry?._embedded?.official;
    if (!official) continue;

    const officialId = String(official.id || "").trim();
    const fullName = `${official.first_name || ""} ${official.last_name || ""}`
      .trim()
      .replace(/\s+/g, " ");

    if (
      !officialId ||
      !fullName ||
      fullName.toLowerCase() === "unknown umpire"
    ) {
      continue;
    }

    assignments.push({
      officialId,
      name: fullName,
    });
  }

  return assignments;
}

function getPayRatePerAssignment(
  ageGroup: string,
  umpireCount: number,
): number {
  const normalized = ageGroup.toUpperCase();

  if (normalized.includes("17U") && umpireCount === 1) {
    return 80;
  }

  if (
    normalized.includes("MAJOR") &&
    !normalized.includes("17U") &&
    umpireCount === 1
  ) {
    return 50;
  }

  const numericMatch =
    normalized.match(/(\d+)\s*U/) || normalized.match(/^(\d+)/);
  if (numericMatch) {
    const age = Number(numericMatch[1]);
    if (!Number.isNaN(age) && PAY_RATE_BY_AGE[age]) {
      return PAY_RATE_BY_AGE[age];
    }
  }

  if (normalized.includes("MAJOR")) return 50;
  return 60;
}

function buildMainReportRows(games: Game[]): MainReportRow[] {
  const rows = games.map((game) => {
    const ageGroup = normalizeAgeGroup(game.age_group as string | undefined);
    const assignments = extractAssignments(game);
    const payPerAssignment = getPayRatePerAssignment(
      ageGroup,
      assignments.length || 1,
    );

    return {
      gameId: String(game.id),
      date: toDateLabel(game.start_time as string | undefined),
      time: toTimeLabel(game.start_time as string | undefined),
      ageGroup,
      homeTeam: (game.home_team as string | undefined)?.trim() || "Home Team",
      awayTeam: (game.away_team as string | undefined)?.trim() || "Away Team",
      venue:
        (
          ((game._embedded as { venue?: { name?: string } } | undefined)?.venue
            ?.name || game.venue) as string | undefined
        )?.trim() || "Unknown Venue",
      subvenue: (game.subvenue as string | undefined)?.trim() || "",
      status: getGameStatusLabel(game.status as string | undefined),
      umpireCount: assignments.length,
      gamePayTotal: assignments.length * payPerAssignment,
    };
  });

  return rows.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.time.localeCompare(b.time);
  });
}

function buildUmpireReportRows(games: Game[]): UmpireReportRow[] {
  const byKey = new Map<string, UmpireReportRow>();

  for (const game of games) {
    const ageGroup = normalizeAgeGroup(game.age_group as string | undefined);
    const assignments = extractAssignments(game);
    if (assignments.length === 0) continue;

    const payPerAssignment = getPayRatePerAssignment(
      ageGroup,
      assignments.length,
    );
    const park =
      (
        ((game._embedded as { venue?: { name?: string } } | undefined)?.venue
          ?.name || game.venue) as string | undefined
      )?.trim() || "Unknown Venue";
    const date = toDateLabel(game.start_time as string | undefined);

    for (const assignment of assignments) {
      const key = `${park}::${date}::${assignment.officialId}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          park,
          date,
          umpireId: assignment.officialId,
          umpireName: assignment.name,
          games: 1,
          totalPay: payPerAssignment,
        });
      } else {
        existing.games += 1;
        existing.totalPay += payPerAssignment;
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const parkCompare = a.park.localeCompare(b.park);
    if (parkCompare !== 0) return parkCompare;
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.umpireName.localeCompare(b.umpireName);
  });
}

export async function GET(request: NextRequest) {
  const admin = await ensureNewsAdmin(request);
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
      limit: 100,
    });

    const filteredGames = games.filter((game) => {
      const status = String(game.status || "")
        .trim()
        .toUpperCase();
      if (status === "X") return false;
      const ageGroup = normalizeAgeGroup(game.age_group as string | undefined);
      return matchesLeagueFilter(ageGroup, leagueFilter);
    });

    if (mode === "umpire") {
      const rows = buildUmpireReportRows(filteredGames);
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

    const rows = buildMainReportRows(filteredGames);
    const totalPay = rows.reduce((sum, row) => sum + row.gamePayTotal, 0);

    return NextResponse.json({
      data: {
        mode,
        rows,
        totals: {
          games: rows.length,
          assignments: rows.reduce((sum, row) => sum + row.umpireCount, 0),
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
