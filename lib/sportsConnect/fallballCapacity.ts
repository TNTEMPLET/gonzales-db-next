import "server-only";

import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { getDriveAccessToken } from "@/lib/google/driveServiceAccount";
import * as XLSX from "xlsx";

/**
 * Division enrollment + matched-coach capacity for Fall Ball. Always renders
 * all 10 standard divisions, sourced in priority order per report:
 *
 * 1. team_rosters — once Team rows exist for the season: real counts from
 *    Team/TeamPlayer/TeamCoachAssignment grouped by ageGroup.
 * 2. sports_connect_sync — before teams exist: the actual synced PLAYER_REG
 *    file (downloaded via driveFileId on the latest DONE
 *    SportsConnectImportRun) parsed for a real per-row Division column.
 * 3. manual_fallback — only when neither of the above has any data yet: a
 *    manually-recorded snapshot (831 players total, broken down below),
 *    always surfaced via playerDataSource so callers never present it as
 *    live/current without saying so.
 *
 * Matched-coach counts per division are always real — sourced from
 * CoachingInterestSubmission.interestedDivision (an actual form field, not
 * regex-parsed free-text admin notes) for CONVERTED coaches, independent of
 * whether teams have been formed.
 */

const FALLBALL_ORG = "fallball" as const;

export const STANDARD_DIVISIONS = [
  "Tee Ball, 3-4 year-olds",
  "Tee Ball, 5 year-olds",
  "Modified Tee Ball, 6 year-olds",
  "Coaches' Pitch 7 year-olds",
  "Coaches' Pitch 8 year-olds",
  "9 year-old",
  "10 year-old",
  "11-12 year-olds",
  "13-15 year-olds",
  "15-17 year-olds",
] as const;

/** Per-division breakdown of the same 831-player manual fallback total. */
const MANUAL_FALLBACK_DIVISION_PLAYER_COUNTS: Record<string, number> = {
  "Tee Ball, 3-4 year-olds": 124,
  "Tee Ball, 5 year-olds": 109,
  "Modified Tee Ball, 6 year-olds": 138,
  "Coaches' Pitch 7 year-olds": 106,
  "Coaches' Pitch 8 year-olds": 65,
  "9 year-old": 87,
  "10 year-old": 47,
  "11-12 year-olds": 97,
  "13-15 year-olds": 41,
  "15-17 year-olds": 17,
};

function recommendedRosterSize(divisionName: string): number {
  if (divisionName.includes("15-17")) return 10;
  if (divisionName.includes("13-15")) return 11;
  return 12;
}

/**
 * Normalizes a division-name string for matching against STANDARD_DIVISIONS —
 * case/punctuation/whitespace insensitive, and treats "9U"/"9yo"/"9 year old"
 * as equivalent. Unlike substring/`includes()` matching, this only matches
 * when the *whole* normalized string agrees, so "Tee Ball 5" can't collapse
 * into the "Tee Ball 3-4" bucket the way a `.includes("Tee Ball")` catch-all
 * would.
 */
function normalizeDivisionKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\byears?\s*olds?\b/g, "")
    .replace(/\byo\b/g, "")
    .replace(/(\d)\s*u\b/g, "$1")
    .trim()
    .replace(/\s+/g, " ");
}

const DIVISION_KEY_LOOKUP: Map<string, string> = new Map(
  STANDARD_DIVISIONS.map((name) => [normalizeDivisionKey(name), name]),
);

function matchStandardDivision(raw: string): string | null {
  const key = normalizeDivisionKey(raw);
  return DIVISION_KEY_LOOKUP.get(key) ?? null;
}

export type FallBallDivisionCapacity = {
  divisionName: string;
  enrolledPlayers: number;
  recommendedRosterSize: number;
  estimatedTeams: number;
  matchedCoaches: number;
  status: "DEFICIT" | "NEAR_CAPACITY" | "IDEAL" | "SURPLUS";
};

export type FallBallPlayerDataSource = "team_rosters" | "sports_connect_sync" | "manual_fallback";

export type FallBallCapacityReport = {
  organizationId: "fallball";
  seasonYear: number;
  seasonLabel: string;
  generatedAt: string;
  teamsFormed: boolean;
  totalPlayers: number;
  totalCoaches: number;
  totalEstimatedTeams: number;
  /** Always all 10 STANDARD_DIVISIONS, in order — never a partial list. */
  divisions: FallBallDivisionCapacity[];
  playerDataSource: FallBallPlayerDataSource;
  lastPlayerRegSyncAt: string | null;
  lastPlayerRegSyncFileName: string | null;
};

function statusForDivision(estimatedTeams: number, coaches: number): FallBallDivisionCapacity["status"] {
  if (estimatedTeams === 0) return "IDEAL";
  if (coaches === 0 || coaches < estimatedTeams - 1) return "DEFICIT";
  if (coaches === estimatedTeams - 1) return "NEAR_CAPACITY";
  if (coaches > estimatedTeams + 2) return "SURPLUS";
  return "IDEAL";
}

/** Downloads and parses the actual synced PLAYER_REG file for real per-division counts. */
async function fetchSyncedDivisionPlayerCounts(driveFileId: string): Promise<Record<string, number> | null> {
  try {
    const token = await getDriveAccessToken();
    if (!token) return null;

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) return null;

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rows.length === 0) return null;

    const counts: Record<string, number> = {};
    let unmatched = 0;
    for (const row of rows) {
      const raw = String(row["Division Name"] ?? row["Division"] ?? "").trim();
      if (!raw) continue;
      const matched = matchStandardDivision(raw);
      if (matched) {
        counts[matched] = (counts[matched] ?? 0) + 1;
      } else {
        unmatched += 1;
      }
    }
    if (unmatched > 0) {
      console.warn(
        `[fallballCapacity] ${unmatched} row(s) had a Division value that didn't match any of the 10 standard divisions.`,
      );
    }
    return Object.keys(counts).length > 0 ? counts : null;
  } catch (err) {
    console.warn("[fallballCapacity] Failed to parse synced PLAYER_REG file:", err);
    return null;
  }
}

async function fetchConvertedCoachCountsByDivision(): Promise<Record<string, number>> {
  const convertedCoaches = await prisma.coachingInterestSubmission.findMany({
    where: { organizationId: FALLBALL_ORG, status: "CONVERTED" },
    select: { interestedDivision: true },
  });

  const counts: Record<string, number> = {};
  for (const coach of convertedCoaches) {
    const matched = matchStandardDivision(coach.interestedDivision);
    if (matched) counts[matched] = (counts[matched] ?? 0) + 1;
  }
  return counts;
}

export async function getFallBallCapacityReport(): Promise<FallBallCapacityReport> {
  const organizationId = FALLBALL_ORG;
  const season = getSeasonConfigForOrg(organizationId);

  const [teams, totalConvertedCoaches, coachCountsByDivision, lastPlayerRun] = await Promise.all([
    prisma.team.findMany({
      where: { organizationId, seasonYear: season.year },
      select: { ageGroup: true, _count: { select: { players: true } } },
    }),
    prisma.coachingInterestSubmission.count({
      where: { organizationId, status: "CONVERTED" },
    }),
    fetchConvertedCoachCountsByDivision(),
    prisma.sportsConnectImportRun.findFirst({
      where: { organizationId, reportKind: "PLAYER_REG", status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, sourceFileName: true, driveFileId: true },
    }),
  ]);

  const teamsFormed = teams.length > 0;

  let playerCountsByDivision: Record<string, number>;
  let playerDataSource: FallBallPlayerDataSource;

  if (teamsFormed) {
    playerCountsByDivision = {};
    for (const team of teams) {
      const matched = matchStandardDivision(team.ageGroup) ?? team.ageGroup;
      playerCountsByDivision[matched] = (playerCountsByDivision[matched] ?? 0) + team._count.players;
    }
    playerDataSource = "team_rosters";
  } else {
    const synced = lastPlayerRun?.driveFileId
      ? await fetchSyncedDivisionPlayerCounts(lastPlayerRun.driveFileId)
      : null;
    if (synced) {
      playerCountsByDivision = synced;
      playerDataSource = "sports_connect_sync";
    } else {
      playerCountsByDivision = MANUAL_FALLBACK_DIVISION_PLAYER_COUNTS;
      playerDataSource = "manual_fallback";
    }
  }

  let totalPlayers = 0;
  let totalEstimatedTeams = 0;

  const divisions: FallBallDivisionCapacity[] = STANDARD_DIVISIONS.map((divisionName) => {
    const enrolledPlayers = playerCountsByDivision[divisionName] ?? 0;
    const rosterSize = recommendedRosterSize(divisionName);
    const estimatedTeams = Math.ceil(enrolledPlayers / rosterSize);
    const matchedCoaches = coachCountsByDivision[divisionName] ?? 0;

    totalPlayers += enrolledPlayers;
    totalEstimatedTeams += estimatedTeams;

    return {
      divisionName,
      enrolledPlayers,
      recommendedRosterSize: rosterSize,
      estimatedTeams,
      matchedCoaches,
      status: statusForDivision(estimatedTeams, matchedCoaches),
    };
  });

  return {
    organizationId,
    seasonYear: season.year,
    seasonLabel: season.label,
    generatedAt: new Date().toISOString(),
    teamsFormed,
    totalPlayers,
    totalCoaches: totalConvertedCoaches,
    totalEstimatedTeams,
    divisions,
    playerDataSource,
    lastPlayerRegSyncAt: lastPlayerRun?.createdAt.toISOString() ?? null,
    lastPlayerRegSyncFileName: lastPlayerRun?.sourceFileName ?? null,
  };
}
