import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { fetchGames, type Game } from "@/lib/fetchGames";
import { ensureNewsAdmin } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { getAssignrLeagueId, resolveAdminTargetOrg } from "@/lib/siteConfig";

type CsvRow = Record<string, string | number | boolean | null | undefined>;

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getRowValue(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return String(row[key]).trim();
    }
  }
  return "";
}

function parseCsvDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = trimmed.match(mmddyyyy);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(dt.valueOf())) return dt;
  }

  const fallback = new Date(trimmed);
  if (Number.isNaN(fallback.valueOf())) return null;
  return fallback;
}

function parseCsvDateTime(dateValue: string, timeValue: string) {
  const date = parseCsvDate(dateValue);
  if (!date) return null;

  const trimmedTime = timeValue.trim();
  if (!trimmedTime) return date;

  const match = trimmedTime.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return date;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  const dt = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hours,
      minutes,
    ),
  );
  if (Number.isNaN(dt.valueOf())) return date;
  return dt;
}

function gameDateKeyFromString(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "";
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}

function gameDateKeyFromDate(value: Date | null) {
  if (!value) return "";
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function gameTimeKeyFromString(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "";
  return `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")}`;
}

function gameTimeKeyFromDate(value: Date | null) {
  if (!value) return "";
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function toScore(value: string) {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.floor(numeric);
}

function buildFallbackKey(homeTeam: string, awayTeam: string, dateKey: string) {
  return `${normalizeText(homeTeam)}|${normalizeText(awayTeam)}|${dateKey}`;
}

function buildFallbackKeyWithTime(
  homeTeam: string,
  awayTeam: string,
  dateKey: string,
  timeKey: string,
) {
  return `${normalizeText(homeTeam)}|${normalizeText(awayTeam)}|${dateKey}|${timeKey}`;
}

export async function POST(request: NextRequest) {
  const targetOrg = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );
  const leagueId = getAssignrLeagueId(targetOrg);
  const auth = await ensureNewsAdmin(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const admin = await getAdminUserFromRequest(request);

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV file is required" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];

    if (!firstSheet) {
      return NextResponse.json(
        { error: "Unable to read uploaded sheet" },
        { status: 400 },
      );
    }

    const rows = XLSX.utils.sheet_to_json<CsvRow>(firstSheet, {
      defval: "",
      raw: false,
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Uploaded file has no rows" },
        { status: 400 },
      );
    }

    const allSeasonGames = await fetchGames({
      startDate: "2026-03-01",
      endDate: "2026-06-30",
      leagueId,
    });

    const gameById = new Map<string, Game>();
    const gameByFallback = new Map<string, Game>();
    const gameByFallbackWithTime = new Map<string, Game>();

    for (const game of allSeasonGames) {
      const gameId = String(game.id || "").trim();
      if (gameId) gameById.set(gameId, game);

      const home = (game.home_team || "").trim();
      const away = (game.away_team || "").trim();
      const dateKey =
        gameDateKeyFromString(game.start_time) ||
        gameDateKeyFromString(game.localized_date);
      const timeKey =
        gameTimeKeyFromString(game.start_time) ||
        gameTimeKeyFromString(game.localized_time);
      if (home && away && dateKey) {
        gameByFallback.set(buildFallbackKey(home, away, dateKey), game);
        if (timeKey) {
          gameByFallbackWithTime.set(
            buildFallbackKeyWithTime(home, away, dateKey, timeKey),
            game,
          );
        }
      }
    }

    let processed = 0;
    let matched = 0;
    let saved = 0;
    let unmatched = 0;
    let skippedMissingScore = 0;
    let skippedRainedOut = 0;

    for (const row of rows) {
      processed += 1;

      const csvMatchId = getRowValue(row, ["Match ID", "match_id", "Game ID"]);
      const csvHomeTeam = getRowValue(row, ["Home Team", "home_team"]);
      const csvAwayTeam = getRowValue(row, ["Away Team", "away_team"]);
      const csvDate = getRowValue(row, ["Date", "Game Date", "game_date"]);
      const csvStartTime = getRowValue(row, [
        "Start Time",
        "Game Time",
        "start_time",
      ]);
      const csvGroup = getRowValue(row, [
        "Group Name",
        "Age Group",
        "age_group",
      ]);
      const csvHomeScore = getRowValue(row, [
        "Home Team Score",
        "Home Score",
        "home_score",
      ]);
      const csvAwayScore = getRowValue(row, [
        "Away Team Score",
        "Away Score",
        "away_score",
      ]);

      const homeScore = toScore(csvHomeScore);
      const awayScore = toScore(csvAwayScore);

      if (homeScore === null || awayScore === null) {
        skippedMissingScore += 1;
        continue;
      }

      let game: Game | undefined;
      if (csvMatchId) {
        game = gameById.get(csvMatchId);
      }

      if (!game && csvHomeTeam && csvAwayTeam) {
        const parsedDate = parseCsvDate(csvDate);
        const dateKey = gameDateKeyFromDate(parsedDate);
        const dateTime = parseCsvDateTime(csvDate, csvStartTime);
        const timeKey = gameTimeKeyFromDate(dateTime);
        if (dateKey) {
          if (timeKey) {
            game = gameByFallbackWithTime.get(
              buildFallbackKeyWithTime(
                csvHomeTeam,
                csvAwayTeam,
                dateKey,
                timeKey,
              ),
            );
          }
          if (!game) {
            game = gameByFallback.get(
              buildFallbackKey(csvHomeTeam, csvAwayTeam, dateKey),
            );
          }
        }
      }

      if (!game) {
        unmatched += 1;
        continue;
      }

      matched += 1;

      const gameStatus = game.status?.trim().toUpperCase() || "";
      if (gameStatus !== "A") {
        skippedRainedOut += 1;
        continue;
      }

      const gameExternalId = String(game.id || "").trim();
      if (!gameExternalId) {
        unmatched += 1;
        continue;
      }

      const parsedDateFromGame = game.start_time
        ? new Date(game.start_time)
        : game.localized_date
          ? new Date(game.localized_date)
          : null;
      const gameDate =
        parsedDateFromGame && !Number.isNaN(parsedDateFromGame.valueOf())
          ? parsedDateFromGame
          : null;

      await prisma.gameScore.upsert({
        where: {
          organizationId_gameExternalId: {
            organizationId: targetOrg,
            gameExternalId,
          },
        },
        create: {
          organizationId: targetOrg,
          gameExternalId,
          ageGroup: (game.age_group || csvGroup || "Unassigned").trim() || null,
          homeTeam: (game.home_team || csvHomeTeam || "Home Team").trim(),
          awayTeam: (game.away_team || csvAwayTeam || "Away Team").trim(),
          gameDate,
          homeScore,
          awayScore,
          enteredByAdminId: admin?.id || null,
        },
        update: {
          ageGroup: (game.age_group || csvGroup || "Unassigned").trim() || null,
          homeTeam: (game.home_team || csvHomeTeam || "Home Team").trim(),
          awayTeam: (game.away_team || csvAwayTeam || "Away Team").trim(),
          gameDate,
          homeScore,
          awayScore,
          enteredByAdminId: admin?.id || null,
        },
      });

      saved += 1;
    }

    return NextResponse.json({
      success: true,
      processed,
      matched,
      saved,
      unmatched,
      skippedMissingScore,
      skippedRainedOut,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to import scores: ${message}` },
      { status: 500 },
    );
  }
}
