import "server-only";

import prisma from "@/lib/prisma";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { downloadDriveFileBuffer } from "@/lib/sportsConnect/driveSync";
import * as XLSX from "xlsx";

export {
  STANDARD_DIVISIONS,
  matchStandardDivisions,
  matchStandardDivision,
} from "./fallballDivisions";
import { STANDARD_DIVISIONS, matchStandardDivisions, matchStandardDivision } from "./fallballDivisions";

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
 * Coach counts per division follow the same three-tier priority, independently
 * of which tier the player counts landed on:
 *
 * 1. team_rosters — once TeamCoachAssignment rows exist for the season: real
 *    per-division coach headcounts from actual team assignments.
 * 2. sports_connect_sync — before team assignments exist: the actual synced
 *    COACH_VOLUNTEER file parsed for real per-row division + role columns.
 * 3. coaching_interest_fallback — only when neither of the above has any
 *    data yet: CoachingInterestSubmission.interestedDivision for CONVERTED
 *    submissions. Once real registered-volunteer data exists (tier 1 or 2),
 *    CoachingInterestSubmission is never read for counts — it is only ever
 *    written to (status flipped to CONVERTED) as a side effect of real
 *    registrations appearing elsewhere, so it can't distort the live numbers.
 */

const FALLBALL_ORG = "fallball" as const;

/** Per-division breakdown of the same 831-player manual fallback total. */
const MANUAL_FALLBACK_DIVISION_PLAYER_COUNTS: Record<string, number> = {
  "4U TB": 124,
  "5U TB": 109,
  "6U MOD": 138,
  "7U CP": 106,
  "8U CP": 65,
  "9U": 87,
  "10U": 47,
  "12U": 97,
  "15U": 41,
  "17U": 17,
};

function recommendedRosterSize(divisionName: string): number {
  if (divisionName === "17U") return 10;
  if (divisionName === "15U") return 11;
  return 12;
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
export type FallBallCoachDataSource = "team_rosters" | "sports_connect_sync" | "coaching_interest_fallback";

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
  coachDataSource: FallBallCoachDataSource;
  lastPlayerRegSyncAt: string | null;
  lastPlayerRegSyncFileName: string | null;
  lastCoachSyncAt: string | null;
  lastCoachSyncFileName: string | null;
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
    const buffer = await downloadDriveFileBuffer(driveFileId);
    if (!buffer) return null;

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

/**
 * Row-level coach/non-coach filter, mirroring shouldImportAsCoach() in
 * app/api/admin/users/import/route.ts. COACH_VOLUNTEER exports legitimately
 * contain non-coaching volunteer roles (concessions, umpires, team parents,
 * explicit "not coaches" rows) — without this filter every volunteer role in
 * the file would be counted as a coach, inflating both the per-division and
 * total registered-coach numbers. A blank role is treated as a coach (same
 * default the import route uses) since most real exports fill this in.
 */
function isCoachVolunteerRole(roleValue: string): boolean {
  const normalized = roleValue.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes("not coaches")) return false;
  return normalized.includes("coach");
}

/** Downloads and parses the actual synced COACH_VOLUNTEER file for real per-division coach counts. */
async function fetchSyncedDivisionCoachCounts(driveFileId: string): Promise<Record<string, number> | null> {
  try {
    const buffer = await downloadDriveFileBuffer(driveFileId);
    if (!buffer) return null;

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) return null;

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rows.length === 0) return null;

    const counts: Record<string, number> = {};
    let unmatched = 0;
    let skippedNonCoach = 0;

    for (const row of rows) {
      const roleValue = String(
        row["Volunteer Role"] ?? row["role"] ?? row["Role"] ?? row["ROLE"] ?? "",
      ).trim();
      if (!isCoachVolunteerRole(roleValue)) {
        skippedNonCoach += 1;
        continue;
      }

      const raw = String(
        row["age_group"] ??
        row["Age Group"] ??
        row["assigned_team"] ??
        row["Assigned Team"] ??
        row["Division Name"] ??
        row["Division"] ??
        ""
      ).trim();
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
        `[fallballCapacity] ${unmatched} coach row(s) had a Division value that didn't match any of the 10 standard divisions.`,
      );
    }
    if (skippedNonCoach > 0) {
      console.warn(
        `[fallballCapacity] ${skippedNonCoach} volunteer row(s) skipped — not a coach role.`,
      );
    }
    // Same contract as fetchSyncedDivisionPlayerCounts: an empty result (no
    // matched rows, e.g. every row failed the coach-role or division match)
    // must return null so the caller falls through to the fallback tier
    // instead of "successfully" resolving to an all-zero sports_connect_sync.
    return Object.keys(counts).length > 0 ? counts : null;
  } catch (err) {
    console.warn("[fallballCapacity] Failed to parse synced COACH_VOLUNTEER file:", err);
    return null;
  }
}

/** Helper to mark CoachingInterestSubmission rows as CONVERTED when real registered coach emails are present. */
export async function markCoachingInterestConverted(organizationId: string, emails: string[]): Promise<number> {
  const cleanEmails = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (cleanEmails.length === 0) return 0;

  const result = await prisma.coachingInterestSubmission.updateMany({
    where: {
      organizationId,
      email: { in: cleanEmails, mode: "insensitive" },
      status: { in: ["NEW", "CONTACTED"] },
    },
    data: {
      status: "CONVERTED",
      convertedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Fallback-only: CONVERTED CoachingInterestSubmission rows, grouped by
 * division. Only ever read by getFallBallCapacityReport() when neither
 * team_rosters nor sports_connect_sync has real coach data yet — never
 * blended with either, per the "Coaching Interest data should not affect
 * the registered volunteers" rule.
 */
async function fetchFallbackCoachCountsByDivision(): Promise<Record<string, number>> {
  const convertedCoaches = await prisma.coachingInterestSubmission.findMany({
    where: { organizationId: FALLBALL_ORG, status: "CONVERTED" },
    select: { interestedDivision: true },
  });

  const counts: Record<string, number> = {};
  let unmatched = 0;
  for (const coach of convertedCoaches) {
    const matches = matchStandardDivisions(coach.interestedDivision);
    if (matches.length === 0) {
      unmatched += 1;
      continue;
    }
    for (const division of matches) {
      counts[division] = (counts[division] ?? 0) + 1;
    }
  }
  if (unmatched > 0) {
    console.warn(
      `[fallballCapacity] ${unmatched} converted coach(es) had an interestedDivision that didn't match any of the 10 standard divisions.`,
    );
  }
  return counts;
}

export async function getFallBallCapacityReport(): Promise<FallBallCapacityReport> {
  const organizationId = FALLBALL_ORG;
  const season = getSeasonConfigForOrg(organizationId);

  const [teams, teamCoachAssignments, totalConvertedCoaches, fallbackCoachCounts, lastPlayerRun, lastCoachRun] = await Promise.all([
    prisma.team.findMany({
      where: { organizationId, seasonYear: season.year },
      select: { ageGroup: true, _count: { select: { players: true } } },
    }),
    prisma.teamCoachAssignment.findMany({
      where: { team: { organizationId, seasonYear: season.year } },
      select: { team: { select: { ageGroup: true } } },
    }),
    prisma.coachingInterestSubmission.count({
      where: { organizationId, status: "CONVERTED" },
    }),
    fetchFallbackCoachCountsByDivision(),
    prisma.sportsConnectImportRun.findFirst({
      where: { organizationId, reportKind: "PLAYER_REG", status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, sourceFileName: true, driveFileId: true },
    }),
    // driveFileId: not null — only a Drive-synced run can be re-downloaded
    // and re-parsed. The manual "Coach Import" admin flow
    // (AdminTeamsManager.tsx -> /api/admin/users/import) also records a DONE
    // COACH_VOLUNTEER run for audit purposes but with no driveFileId (it's a
    // direct upload); without this filter a manual-import run newer than a
    // real Drive sync would shadow the real sync and force a false fallback.
    prisma.sportsConnectImportRun.findFirst({
      where: { organizationId, reportKind: "COACH_VOLUNTEER", status: "DONE", driveFileId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, sourceFileName: true, driveFileId: true },
    }),
  ]);

  const teamsFormed = teams.length > 0;

  // 1. Resolve Players
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

  // 2. Resolve Coaches
  let coachCountsByDivision: Record<string, number>;
  let coachDataSource: FallBallCoachDataSource;

  if (teamsFormed && teamCoachAssignments.length > 0) {
    coachCountsByDivision = {};
    for (const assignment of teamCoachAssignments) {
      const ageGroup = assignment.team?.ageGroup;
      if (ageGroup) {
        const matched = matchStandardDivision(ageGroup) ?? ageGroup;
        coachCountsByDivision[matched] = (coachCountsByDivision[matched] ?? 0) + 1;
      }
    }
    coachDataSource = "team_rosters";
  } else {
    const syncedCoach = lastCoachRun?.driveFileId
      ? await fetchSyncedDivisionCoachCounts(lastCoachRun.driveFileId)
      : null;
    if (syncedCoach) {
      coachCountsByDivision = syncedCoach;
      coachDataSource = "sports_connect_sync";
    } else {
      coachCountsByDivision = fallbackCoachCounts;
      coachDataSource = "coaching_interest_fallback";
    }
  }

  let totalPlayers = 0;
  let totalEstimatedTeams = 0;
  let totalMatchedCoaches = 0;

  const divisions: FallBallDivisionCapacity[] = STANDARD_DIVISIONS.map((divisionName) => {
    const enrolledPlayers = playerCountsByDivision[divisionName] ?? 0;
    const rosterSize = recommendedRosterSize(divisionName);
    const estimatedTeams = Math.ceil(enrolledPlayers / rosterSize);
    const matchedCoaches = coachCountsByDivision[divisionName] ?? 0;

    totalPlayers += enrolledPlayers;
    totalEstimatedTeams += estimatedTeams;
    totalMatchedCoaches += matchedCoaches;

    return {
      divisionName,
      enrolledPlayers,
      recommendedRosterSize: rosterSize,
      estimatedTeams,
      matchedCoaches,
      status: statusForDivision(estimatedTeams, matchedCoaches),
    };
  });

  // team_rosters / sports_connect_sync: totalCoaches must equal the table's
  // own column sum (same contract as totalPlayers below) — these are single-
  // division-per-coach sources, so any mismatch would only mean a real bug.
  // coaching_interest_fallback is the one legitimate exception: a coach can
  // name more than one division on the interest form (see
  // matchStandardDivisions), so totalConvertedCoaches (distinct coaches) can
  // be lower than the column sum — the UI footnote explains that case.
  const totalCoaches =
    coachDataSource === "coaching_interest_fallback" ? totalConvertedCoaches : totalMatchedCoaches;

  return {
    organizationId,
    seasonYear: season.year,
    seasonLabel: season.label,
    generatedAt: new Date().toISOString(),
    teamsFormed,
    totalPlayers,
    totalCoaches,
    totalEstimatedTeams,
    divisions,
    playerDataSource,
    coachDataSource,
    lastPlayerRegSyncAt: lastPlayerRun?.createdAt.toISOString() ?? null,
    lastPlayerRegSyncFileName: lastPlayerRun?.sourceFileName ?? null,
    lastCoachSyncAt: lastCoachRun?.createdAt.toISOString() ?? null,
    lastCoachSyncFileName: lastCoachRun?.sourceFileName ?? null,
  };
}
