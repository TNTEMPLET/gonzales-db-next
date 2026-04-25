import { NextRequest, NextResponse } from "next/server";

import { ensureAdminRole } from "@/lib/news/auth";
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
  umpires: { name: string; pay: number }[];
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

const LEGACY_PAY_RATES: Record<string, number> = {
  "6U LLB": 40,
  "7U LLB": 40,
  "8U LLB": 40,
  "8U MAJ LLB": 40,
  "9U DYB": 60,
  "10U DYB": 60,
  "10U LLB": 50,
  "12U DYB": 60,
  "12U LLB": 50,
  "15U DBB": 80,
  "17U DPM": 60,
};

const SPLIT_50_AGE_PREFIXES = ["9U", "10U", "12U"];

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

function normalizeAgeGroupKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function getGameStatusLabel(status: string | undefined): string {
  if (status === "A") return "Assigned";
  if (status === "C") return "Cancelled";
  if (status === "F") return "Final";
  return (status || "Scheduled").trim() || "Scheduled";
}

function toDateLabel(value: string | undefined): string {
  if (!value) return "Date TBD";
  // Assignr localized_date is "YYYY-MM-DD" — parse as local time to avoid UTC date shift
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Date TBD";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toTimeLabel(value: string | undefined): string {
  return value?.trim() || "TBD";
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

function getBasePayRate(ageGroup: string): number {
  const normalized = normalizeAgeGroupKey(ageGroup);
  if (LEGACY_PAY_RATES[normalized]) {
    return LEGACY_PAY_RATES[normalized];
  }

  if (normalized.includes("MAJ") || normalized.includes("MAJOR")) {
    return 50;
  }

  return 60;
}

function computeAssignmentPays(
  ageGroup: string,
  status: string | undefined,
  assignmentCount: number,
): number[] {
  if (assignmentCount <= 0) return [];

  const normalized = normalizeAgeGroupKey(ageGroup);
  const normalizedStatus = (status || "").trim().toUpperCase();
  if (normalizedStatus === "C") {
    return Array.from({ length: assignmentCount }, () => 0);
  }

  const baseRate = getBasePayRate(ageGroup);

  if (assignmentCount === 1) {
    if (normalized === "17U DPM") return [80];
    if (normalized.includes("MAJ") || normalized.includes("MAJOR")) {
      return [50];
    }
    return [baseRate];
  }

  if (SPLIT_50_AGE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return Array.from({ length: assignmentCount }, () => 50);
  }

  return Array.from({ length: assignmentCount }, () => baseRate);
}

function buildMainReportRows(games: Game[]): MainReportRow[] {
  const rows = games.map((game) => {
    const ageGroup = normalizeAgeGroup(game.age_group as string | undefined);
    const assignments = extractAssignments(game);
    const assignmentPays = computeAssignmentPays(
      ageGroup,
      game.status as string | undefined,
      assignments.length,
    );

    return {
      gameId: String(game.id),
      date: toDateLabel(game.localized_date as string | undefined),
      time: toTimeLabel(game.localized_time as string | undefined),
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
      umpires: assignments.map((a, i) => ({
        name: a.name,
        pay:
          assignmentPays[i] ?? assignmentPays[assignmentPays.length - 1] ?? 0,
      })),
      gamePayTotal: assignmentPays.reduce((sum, pay) => sum + pay, 0),
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

    const assignmentPays = computeAssignmentPays(
      ageGroup,
      game.status as string | undefined,
      assignments.length,
    );
    const park =
      (
        ((game._embedded as { venue?: { name?: string } } | undefined)?.venue
          ?.name || game.venue) as string | undefined
      )?.trim() || "Unknown Venue";
    const date = toDateLabel(game.localized_date as string | undefined);

    for (const [index, assignment] of assignments.entries()) {
      const assignmentPay =
        assignmentPays[index] ?? assignmentPays[assignmentPays.length - 1] ?? 0;
      const key = `${park}::${date}::${assignment.officialId}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          park,
          date,
          umpireId: assignment.officialId,
          umpireName: assignment.name,
          games: 1,
          totalPay: assignmentPay,
        });
      } else {
        existing.games += 1;
        existing.totalPay += assignmentPay;
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
  const admin = await ensureAdminRole(request, "PARK_DIRECTOR");
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
