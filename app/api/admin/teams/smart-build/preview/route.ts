import { NextRequest, NextResponse } from "next/server";

import { parseSeasonYear } from "@/lib/allStar/server";
import { ensureAdminModule } from "@/lib/news/auth";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { downloadDriveFileBuffer } from "@/lib/sportsConnect/driveSync";
import { estimateMissingGuardianEmailFromRows } from "@/lib/sportsConnect/guardianEstimate";
import { detectSportsConnectReport } from "@/lib/sportsConnect/columnProfiles";
import { parseSportsConnectExportBuffer, SPORTS_CONNECT_INGEST_MAX_ROWS } from "@/lib/sportsConnect/parseExportBuffer";
import {
  buildTeamListPreviewRows,
  summarizeTeamListRows,
  type TeamListImportRow,
} from "@/lib/sportsConnect/teamListPreview";
import {
  getRowValue,
  parseSeasonYearFromProgramName,
  PLAYER_IMPORT_DIVISION_KEYS,
  PLAYER_IMPORT_EMAIL_KEYS,
  PLAYER_IMPORT_NAME_KEYS,
  PLAYER_IMPORT_TEAM_KEYS,
  shouldSkipDivisionImport,
  type Row,
} from "@/app/api/admin/teams/import/route";
import {
  isValidEmail,
  shouldImportAsCoach,
  getRowValue as getCoachRowValue,
  type CsvRow,
} from "@/app/api/admin/users/import/route";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SourceInput = { buffer: Buffer; fileName: string } | null;

type PlayerPreviewRow = {
  rowNumber: number;
  ageGroup: string;
  teamName: string;
  fullName: string;
  guardianEmail: string | null;
  action: "CREATE" | "UPDATE" | "SKIP";
  reason: string | null;
  matchesTeamList: boolean | null; // null when no Team List file was provided to compare against
};

type PlayerPreview = {
  fileName: string;
  reportKindWarning: string | null;
  rows: PlayerPreviewRow[];
  summary: { total: number; create: number; update: number; skip: number };
  missingGuardianEmailEstimate: number;
  /** Distinct age groups found in non-skipped rows, for the wizard's per-age-group Roster build method picker. */
  ageGroups: { ageGroup: string; hasDraftSession: boolean }[];
};

type CoachPreviewRow = {
  rowNumber: number;
  email: string;
  name: string;
  ageGroup: string;
  action: "CREATE" | "UPDATE" | "SKIP";
  reason: string | null;
};

type CoachPreview = {
  fileName: string;
  reportKindWarning: string | null;
  rows: CoachPreviewRow[];
  summary: { total: number; create: number; update: number; skip: number };
};

type FamilyCoachMatch = {
  email: string;
  coachName: string;
  playerNames: string[];
};

async function resolveSource(
  formData: FormData | null,
  jsonBody: Record<string, unknown> | null,
  fileKey: string,
  driveFileIdKey: string,
): Promise<SourceInput> {
  const file = formData?.get(fileKey);
  if (file instanceof File) {
    return { buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name };
  }
  const driveFileId =
    (formData?.get(driveFileIdKey) as string | null) ??
    (typeof jsonBody?.[driveFileIdKey] === "string" ? (jsonBody[driveFileIdKey] as string) : null);
  if (driveFileId?.trim()) {
    const buffer = await downloadDriveFileBuffer(driveFileId.trim());
    if (!buffer) return null;
    return { buffer, fileName: `drive:${driveFileId.trim()}` };
  }
  return null;
}

function reportKindWarningFor(
  headers: string[],
  expected: "TEAM_LIST" | "PLAYER_REG" | "COACH_VOLUNTEER",
  slotLabel: string,
): string | null {
  const detection = detectSportsConnectReport(headers);
  if (detection.reportKind && detection.reportKind !== expected) {
    return `This looks like a ${detection.reportKind.replaceAll("_", " ").toLowerCase()} file, not a ${slotLabel} file — double-check you picked the right file for this slot.`;
  }
  return null;
}

async function buildPlayerPreview(
  source: SourceInput,
  targetOrg: string,
  seasonYear: number,
  teamListRows: TeamListImportRow[] | null,
): Promise<PlayerPreview | null> {
  if (!source) return null;
  const parsed = parseSportsConnectExportBuffer({
    buffer: source.buffer,
    fileName: source.fileName,
    sampleRows: SPORTS_CONNECT_INGEST_MAX_ROWS,
  });
  const reportKindWarning = reportKindWarningFor(parsed.headers, "PLAYER_REG", "Player Registration");

  const teamListKeys = teamListRows
    ? new Set(
        teamListRows
          .filter((r) => r.action !== "SKIP")
          .map((r) => `${r.ageGroup.trim().toLowerCase()}::${r.teamName.trim().toLowerCase()}`),
      )
    : null;

  const rows: PlayerPreviewRow[] = [];
  let create = 0;
  let update = 0;
  let skip = 0;

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const row = parsed.rows[i] as Row;
    const rawAgeGroup = getRowValue(row, PLAYER_IMPORT_DIVISION_KEYS) || "";
    const teamName = getRowValue(row, PLAYER_IMPORT_TEAM_KEYS) || "";
    const fullName =
      getRowValue(row, PLAYER_IMPORT_NAME_KEYS) ||
      [
        getRowValue(row, ["Player First Name", "First Name", "first_name"]),
        getRowValue(row, ["Player Last Name", "Last Name", "last_name"]),
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
    const guardianEmail = getRowValue(row, PLAYER_IMPORT_EMAIL_KEYS) || null;
    const programName = getRowValue(row, ["Program Name", "Program", "Season", "season"]);
    const rowSeasonYear = seasonYear || parseSeasonYearFromProgramName(programName);

    let action: PlayerPreviewRow["action"] = "CREATE";
    let reason: string | null = null;

    if (shouldSkipDivisionImport(rawAgeGroup)) {
      action = "SKIP";
      reason = "Division is excluded from player imports";
    } else if (!rawAgeGroup || !teamName || !fullName || !rowSeasonYear) {
      action = "SKIP";
      reason = "Missing required age group, team name, or player name";
    } else {
      const existingTeam = await prisma.team.findUnique({
        where: {
          organizationId_seasonYear_ageGroup_teamName: {
            organizationId: targetOrg,
            seasonYear: rowSeasonYear,
            ageGroup: rawAgeGroup,
            teamName,
          },
        },
        select: { id: true },
      });
      if (existingTeam) {
        const existingPlayer = await prisma.teamPlayer.findFirst({
          where: { teamId: existingTeam.id, fullName: { equals: fullName, mode: "insensitive" } },
          select: { id: true },
        });
        action = existingPlayer ? "UPDATE" : "CREATE";
      } else {
        action = "CREATE";
      }
    }

    const matchesTeamList = teamListKeys
      ? teamListKeys.has(`${rawAgeGroup.trim().toLowerCase()}::${teamName.trim().toLowerCase()}`)
      : null;

    if (action === "CREATE") create += 1;
    else if (action === "UPDATE") update += 1;
    else skip += 1;

    rows.push({
      rowNumber: i + 1,
      ageGroup: rawAgeGroup,
      teamName,
      fullName,
      guardianEmail,
      action,
      reason,
      matchesTeamList,
    });
  }

  const missingGuardianEmailEstimate = estimateMissingGuardianEmailFromRows(parsed.rows).missingGuardianEmail;

  const distinctAgeGroups = Array.from(
    new Set(rows.filter((r) => r.action !== "SKIP" && r.ageGroup).map((r) => r.ageGroup)),
  );
  const sessionsForAgeGroups =
    distinctAgeGroups.length > 0
      ? await prisma.draftSession.findMany({
          where: { organizationId: targetOrg, seasonYear, ageGroup: { in: distinctAgeGroups } },
          select: { ageGroup: true },
        })
      : [];
  const ageGroupsWithSession = new Set(sessionsForAgeGroups.map((s) => s.ageGroup));
  const ageGroups = distinctAgeGroups.map((ageGroup) => ({
    ageGroup,
    hasDraftSession: ageGroupsWithSession.has(ageGroup),
  }));

  return {
    fileName: source.fileName,
    reportKindWarning,
    rows,
    summary: { total: rows.length, create, update, skip },
    missingGuardianEmailEstimate,
    ageGroups,
  };
}

async function buildCoachPreview(
  source: SourceInput,
  targetOrg: string,
): Promise<CoachPreview | null> {
  if (!source) return null;
  const parsed = parseSportsConnectExportBuffer({
    buffer: source.buffer,
    fileName: source.fileName,
    sampleRows: SPORTS_CONNECT_INGEST_MAX_ROWS,
  });
  const reportKindWarning = reportKindWarningFor(parsed.headers, "COACH_VOLUNTEER", "Coach/Volunteer");

  const rows: CoachPreviewRow[] = [];
  let create = 0;
  let update = 0;
  let skip = 0;

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const row = parsed.rows[i] as CsvRow;
    const email = getCoachRowValue(row, ["email", "Email", "EMAIL", "Volunteer Email Address"]);
    const volunteerRole = getCoachRowValue(row, ["Volunteer Role", "role", "Role", "ROLE"]);
    const firstName = getCoachRowValue(row, ["first_name", "First Name", "Volunteer First Name"]);
    const lastName = getCoachRowValue(row, ["last_name", "Last Name", "Volunteer Last Name"]);
    const ageGroup = getCoachRowValue(row, ["age_group", "Age Group", "Division Name"]);
    const name = [firstName, lastName].filter(Boolean).join(" ");

    let action: CoachPreviewRow["action"] = "CREATE";
    let reason: string | null = null;

    if (!email || !isValidEmail(email)) {
      action = "SKIP";
      reason = "Missing or invalid email";
    } else if (!shouldImportAsCoach(volunteerRole)) {
      action = "SKIP";
      reason = "Not a coach role";
    } else {
      // Matches applyCoachImportRows: a RegisteredUser existing globally
      // isn't enough to count as "UPDATE" — the row also needs an existing
      // org profile for this org, otherwise a coach who already has an
      // account from a different org still gets a new profile created here.
      const existing = await prisma.registeredUser.findFirst({
        where: { email: email.toLowerCase() },
        select: { id: true },
      });
      const profile = existing
        ? await prisma.registeredUserOrgProfile.findUnique({
            where: {
              registeredUserId_organizationId: {
                registeredUserId: existing.id,
                organizationId: targetOrg,
              },
            },
            select: { id: true },
          })
        : null;
      action = existing && profile ? "UPDATE" : "CREATE";
    }

    if (action === "CREATE") create += 1;
    else if (action === "UPDATE") update += 1;
    else skip += 1;

    rows.push({ rowNumber: i + 1, email, name, ageGroup, action, reason });
  }

  return {
    fileName: source.fileName,
    reportKindWarning,
    rows,
    summary: { total: rows.length, create, update, skip },
  };
}

function matchFamiliesToCoaches(
  playerPreview: PlayerPreview | null,
  coachPreview: CoachPreview | null,
): FamilyCoachMatch[] {
  if (!playerPreview || !coachPreview) return [];
  const coachByEmail = new Map<string, string>();
  for (const row of coachPreview.rows) {
    if (row.action === "SKIP" || !row.email) continue;
    coachByEmail.set(row.email.toLowerCase(), row.name || row.email);
  }
  const matches = new Map<string, FamilyCoachMatch>();
  for (const row of playerPreview.rows) {
    if (!row.guardianEmail) continue;
    const key = row.guardianEmail.toLowerCase();
    const coachName = coachByEmail.get(key);
    if (!coachName) continue;
    const existing = matches.get(key);
    if (existing) {
      if (!existing.playerNames.includes(row.fullName)) existing.playerNames.push(row.fullName);
    } else {
      matches.set(key, { email: key, coachName, playerNames: [row.fullName] });
    }
  }
  return Array.from(matches.values());
}

/**
 * POST /api/admin/teams/smart-build/preview
 *
 * Stage 2 of the Smart Auto-Build wizard: parses whichever of Team List /
 * Player Registration / Coach-Volunteer files were provided (as uploaded
 * files or driveFileIds picked from the inspector step) using the shared
 * preview builders, cross-checks players/coaches against each other and
 * against the Team List, and returns one combined preview instead of three
 * separate modal previews.
 *
 * Accepts multipart/form-data (file fields: teamList, playerReg, coachVol;
 * or driveFileId fields: teamListDriveFileId, playerRegDriveFileId,
 * coachVolDriveFileId) or an equivalent JSON body carrying only driveFileIds.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));

  try {
    const contentType = request.headers.get("content-type") || "";

    let formData: FormData | null = null;
    let jsonBody: Record<string, unknown> | null = null;
    if (contentType.includes("multipart/form-data")) {
      formData = await request.formData();
    } else {
      jsonBody = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    }

    const seasonYearRaw =
      (formData?.get("seasonYear") as string | null) ??
      (typeof jsonBody?.seasonYear === "string" || typeof jsonBody?.seasonYear === "number"
        ? String(jsonBody.seasonYear)
        : "");
    const seasonYear = parseSeasonYear(seasonYearRaw);
    if (!seasonYear) {
      return NextResponse.json({ error: "seasonYear is required" }, { status: 400 });
    }

    const [teamListSource, playerRegSource, coachVolSource] = await Promise.all([
      resolveSource(formData, jsonBody, "teamList", "teamListDriveFileId"),
      resolveSource(formData, jsonBody, "playerReg", "playerRegDriveFileId"),
      resolveSource(formData, jsonBody, "coachVol", "coachVolDriveFileId"),
    ]);

    if (!teamListSource && !playerRegSource && !coachVolSource) {
      return NextResponse.json(
        { error: "At least one of teamList, playerReg, or coachVol is required" },
        { status: 400 },
      );
    }

    let teamListRows: TeamListImportRow[] | null = null;
    let teamListSummary = null;
    let teamListReportKindWarning: string | null = null;
    if (teamListSource) {
      teamListReportKindWarning = reportKindWarningFor(
        parseSportsConnectExportBuffer({ buffer: teamListSource.buffer, fileName: teamListSource.fileName })
          .headers,
        "TEAM_LIST",
        "Team List",
      );
      teamListRows = await buildTeamListPreviewRows({
        targetOrg,
        seasonYear,
        source: { kind: "buffer", buffer: teamListSource.buffer, fileName: teamListSource.fileName },
      });
      teamListSummary = summarizeTeamListRows(teamListRows);
    }

    const [playerPreview, coachPreview] = await Promise.all([
      buildPlayerPreview(playerRegSource, targetOrg, seasonYear, teamListRows),
      buildCoachPreview(coachVolSource, targetOrg),
    ]);

    const familyCoachMatches = matchFamiliesToCoaches(playerPreview, coachPreview);

    const unmatchedPlayerRows =
      playerPreview && teamListRows
        ? playerPreview.rows.filter((r) => r.action !== "SKIP" && r.matchesTeamList === false).length
        : 0;

    return NextResponse.json({
      data: {
        organizationId: targetOrg,
        seasonYear,
        teamList: teamListSource
          ? {
              fileName: teamListSource.fileName,
              reportKindWarning: teamListReportKindWarning,
              rows: teamListRows,
              summary: teamListSummary,
            }
          : null,
        playerReg: playerPreview,
        coachVol: coachPreview,
        familyCoachMatches,
        warnings: [
          unmatchedPlayerRows > 0
            ? `${unmatchedPlayerRows} player row(s) reference a division/team not found in the Team List file.`
            : null,
        ].filter((w): w is string => !!w),
      },
    });
  } catch (err) {
    console.error("[api/admin/teams/smart-build/preview POST]", err);
    const code = typeof err === "object" && err && "code" in err ? String((err as { code?: unknown }).code) : "";
    const message = err instanceof Error ? err.message : String(err);
    const missingSchema = code === "P2021" || code === "P2022" || /relation .* does not exist|column .* does not exist/i.test(message);
    return NextResponse.json(
      {
        error: missingSchema
          ? "Smart Auto-Build's database tables aren't provisioned in this environment yet. Run the pending Prisma migration."
          : "Failed to build preview. " + message,
      },
      { status: 500 },
    );
  }
}
