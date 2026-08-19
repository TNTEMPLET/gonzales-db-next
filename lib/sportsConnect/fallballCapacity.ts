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
 * would. This is the precise, high-confidence tier — real free text (coach
 * interest forms, shorthand roster imports) usually doesn't survive it, which
 * is what matchStandardDivisions()'s looser tiers below are for.
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

function matchStandardDivisionExact(raw: string): string | null {
  return DIVISION_KEY_LOOKUP.get(normalizeDivisionKey(raw)) ?? null;
}

/**
 * Age (in whole years) -> owning standard division(s). 15 is the one
 * genuinely ambiguous age — "13-15 year-olds" and "15-17 year-olds" both
 * claim it in the real division names — so a bare, un-ranged "15" resolves
 * to both. Any range that actually spells out either boundary (e.g.
 * "13-15", "15-17", or the full division name) is caught by the exact-match
 * tier above before this table is ever consulted, so the ambiguity only
 * surfaces for genuinely bare input.
 */
const AGE_TO_DIVISION: Record<number, readonly string[]> = {
  3: ["Tee Ball, 3-4 year-olds"],
  4: ["Tee Ball, 3-4 year-olds"],
  5: ["Tee Ball, 5 year-olds"],
  6: ["Modified Tee Ball, 6 year-olds"],
  7: ["Coaches' Pitch 7 year-olds"],
  8: ["Coaches' Pitch 8 year-olds"],
  9: ["9 year-old"],
  10: ["10 year-old"],
  11: ["11-12 year-olds"],
  12: ["11-12 year-olds"],
  13: ["13-15 year-olds"],
  14: ["13-15 year-olds"],
  15: ["13-15 year-olds", "15-17 year-olds"],
  16: ["15-17 year-olds"],
  17: ["15-17 year-olds"],
};

/**
 * Pulls every plausible age (3-17) out of free text, regardless of how it's
 * written — "7U", "10u", "15yo", "3/4", "11-12" all reduce to bare digit
 * tokens once suffixes and non-digit separators are stripped. A bare
 * multi-digit run outside 3-17 (e.g. a "2026" season year that leaked into
 * the field) never matches because it isn't a 1-2 digit token to begin with.
 */
function extractAgeNumbers(raw: string): number[] {
  const withoutAgeSuffixes = raw
    .toLowerCase()
    // "7u", "10u", "15yo" -> "7 ", "10 ", "15 " (keep the digits, drop the suffix)
    .replace(/(\d{1,2})\s*(?:u|yo)(?![a-z0-9])/g, "$1 ")
    // Any remaining letters ("dyb", "tee", "ball", "year", "olds", ...) are noise.
    .replace(/[a-z]+/g, " ");

  const ages = (withoutAgeSuffixes.match(/\d{1,2}/g) ?? [])
    .map(Number)
    .filter((n) => n >= 3 && n <= 17);

  return Array.from(new Set(ages));
}

type KeywordFallbackRule = { test: RegExp; divisions: readonly string[] };

/**
 * Last-resort tier for text with no extractable age number at all — checked
 * in order so "modified tee ball" (unambiguous) is claimed before the
 * generic "tee ball" rule (ambiguous between the 3-4 and 5 year-old
 * divisions) ever gets a chance to also match the same text.
 */
const KEYWORD_FALLBACK_RULES: readonly KeywordFallbackRule[] = [
  { test: /modified/, divisions: ["Modified Tee Ball, 6 year-olds"] },
  {
    test: /coach(?:es)?\s*'?\s*pitch/,
    divisions: ["Coaches' Pitch 7 year-olds", "Coaches' Pitch 8 year-olds"],
  },
  { test: /tee\s*ball/, divisions: ["Tee Ball, 3-4 year-olds", "Tee Ball, 5 year-olds"] },
];

/**
 * Flexible division matcher — resolves shorthand, multi-division, and
 * suffix-noisy free text (e.g. "7U", "6u", "3/4 tee ball", "11/12",
 * "10u DYB", "7U/8U") to every standard division it plausibly names, not
 * just one. Three tiers, most confident first:
 *  1. Exact match after normalization (unchanged from before).
 *  2. Every 3-17 age number found in the text, mapped to its division(s).
 *  3. Unambiguous keyword fallback, only when tier 2 found nothing.
 * Returns [] when nothing matches at any tier — callers should never treat
 * that as "division 0", only as "no signal".
 */
export function matchStandardDivisions(raw: string): string[] {
  if (!raw || !raw.trim()) return [];

  const exact = matchStandardDivisionExact(raw);
  if (exact) return [exact];

  const matchedFromAges = new Set<string>();
  for (const age of extractAgeNumbers(raw)) {
    for (const division of AGE_TO_DIVISION[age] ?? []) {
      matchedFromAges.add(division);
    }
  }
  if (matchedFromAges.size > 0) {
    return STANDARD_DIVISIONS.filter((division) => matchedFromAges.has(division));
  }

  const lowered = raw.toLowerCase();
  for (const rule of KEYWORD_FALLBACK_RULES) {
    if (rule.test.test(lowered)) return [...rule.divisions];
  }

  return [];
}

/** Single-division convenience wrapper — for callers where a value can only ever belong to one division (a player's own division, a team's ageGroup), not free text that may legitimately name several. */
function matchStandardDivision(raw: string): string | null {
  return matchStandardDivisions(raw)[0] ?? null;
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
