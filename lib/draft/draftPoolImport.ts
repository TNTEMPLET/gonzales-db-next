import { prisma } from "@/lib/prisma";

import { matchStandardDivision } from "@/lib/sportsConnect/fallballDivisions";
import {
  getRowValue,
  parseSeasonYearFromProgramName,
  shouldSkipDivisionImport,
  splitName,
  PLAYER_IMPORT_DIVISION_KEYS,
  PLAYER_IMPORT_EMAIL_KEYS,
  PLAYER_IMPORT_NAME_KEYS,
  type Row,
} from "@/app/api/admin/teams/import/route";

/**
 * Routes Player Registration rows for age groups flagged as `DRAFT` roster
 * build method (rather than the default `DIRECT_IMPORT`) into a
 * DraftPlayerPool instead of a real TeamPlayer — the Smart Auto-Build "Roster
 * build method" seam from plan-teams-smart-auto-build.md Stage 1: rows an
 * admin already has synced from Drive become the draft pool for free, no
 * separate pool-import step. Reuses the same row-value extraction
 * (getRowValue/PLAYER_IMPORT_*_KEYS) as applyImportRows
 * (app/api/admin/teams/import/route.ts) so a division/name column alias
 * recognized by the direct-import path is recognized here too.
 *
 * One DraftSession per (org, seasonYear, ageGroup) is found or created in
 * SETUP status — this is also what lib/draft/coachPlayerMatcher.ts's
 * detectCoachPlayerMatches() reads from for Stage 2 coach/player pairing, so
 * populating DraftPlayerPool here is what makes that stage (and the Live
 * Draft Room) usable at all for a Smart Auto-Build run.
 */

export type DraftPoolImportSkipDetail = {
  rowNumber: number;
  reason: string;
  playerName?: string;
  ageGroup?: string;
};

export type DraftPoolImportResult = {
  processed: number;
  createdSessions: number;
  createdEntries: number;
  updatedEntries: number;
  skipped: number;
  createdEntryIds: string[];
  /** DraftSessions this call created (not found-existing) — for undo, see undoBatch in app/api/admin/teams/import/route.ts. */
  createdSessionIds: string[];
  sessionIdsByAgeGroup: Record<string, string>;
  skippedDetails: DraftPoolImportSkipDetail[];
};

const GUARDIAN_PHONE_KEYS = [
  "Telephone",
  "Account Phone",
  "Cellphone",
  "Other Phone",
  "Parent Phone",
  "Guardian Phone",
  "Phone",
];

const BIRTH_DATE_KEYS = ["Player Birth Date", "Participant Birth Date", "Birth Date", "DOB"];

export async function applyDraftPoolRows(params: {
  rows: Row[];
  targetOrg: string;
  seasonYear: number;
  adminId: string | null;
}): Promise<DraftPoolImportResult> {
  const { rows, targetOrg, seasonYear, adminId } = params;

  let processed = 0;
  let createdSessions = 0;
  let createdEntries = 0;
  let updatedEntries = 0;
  let skipped = 0;
  const createdEntryIds: string[] = [];
  const createdSessionIds: string[] = [];
  const sessionIdsByAgeGroup: Record<string, string> = {};
  const skippedDetails: DraftPoolImportSkipDetail[] = [];

  const pushSkip = (rowNumber: number, reason: string, ageGroup?: string, playerName?: string) => {
    if (skippedDetails.length >= 20) return;
    skippedDetails.push({ rowNumber, reason, ageGroup: ageGroup || undefined, playerName: playerName || undefined });
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 1;
    processed += 1;

    const rawAgeGroup = getRowValue(row, PLAYER_IMPORT_DIVISION_KEYS) || "";
    if (shouldSkipDivisionImport(rawAgeGroup)) {
      skipped += 1;
      pushSkip(rowNumber, "Division is excluded from player imports", rawAgeGroup);
      continue;
    }

    const programName = getRowValue(row, ["Program Name", "Program", "Season", "season"]);
    const rowSeasonYear = seasonYear || parseSeasonYearFromProgramName(programName);
    const fullName =
      getRowValue(row, PLAYER_IMPORT_NAME_KEYS) ||
      [
        getRowValue(row, ["Player First Name", "Participant First Name", "First Name", "first_name"]),
        getRowValue(row, ["Player Last Name", "Participant Last Name", "Last Name", "last_name"]),
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    if (!rawAgeGroup || !fullName || !rowSeasonYear) {
      skipped += 1;
      pushSkip(rowNumber, "Missing required age group, player name, or season year", rawAgeGroup, fullName || undefined);
      continue;
    }

    // Fall Ball standardizes on 10 short codes (4U TB ... 17U) and every
    // real DraftSession already carries one of those codes as its ageGroup
    // -- must resolve raw SportsConnect division text the same way
    // applyImportRows()/smart-build preview do, or a fresh export's raw
    // text (e.g. "9 year-old") never matches an in-progress session named
    // "9U" and this silently forks off a duplicate, orphaned DraftSession.
    const ageGroup = (targetOrg === "fallball" ? matchStandardDivision(rawAgeGroup) : null) || rawAgeGroup;

    let draftSessionId = sessionIdsByAgeGroup[ageGroup];
    if (!draftSessionId) {
      const existing = await prisma.draftSession.findFirst({
        where: { organizationId: targetOrg, seasonYear: rowSeasonYear, ageGroup },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (existing) {
        draftSessionId = existing.id;
      } else {
        const created = await prisma.draftSession.create({
          data: {
            organizationId: targetOrg,
            seasonYear: rowSeasonYear,
            ageGroup,
            name: `${rowSeasonYear} ${ageGroup} Draft`,
            status: "SETUP",
            createdByAdminId: adminId,
          },
          select: { id: true },
        });
        draftSessionId = created.id;
        createdSessions += 1;
        createdSessionIds.push(created.id);
      }
      sessionIdsByAgeGroup[ageGroup] = draftSessionId;
    }

    const { firstName, lastName } = splitName(fullName);
    const guardianEmail = getRowValue(row, PLAYER_IMPORT_EMAIL_KEYS) || null;
    const guardianPhone = getRowValue(row, GUARDIAN_PHONE_KEYS) || null;
    const birthDateRaw = getRowValue(row, BIRTH_DATE_KEYS);
    const parsedBirthDate = birthDateRaw ? new Date(birthDateRaw) : null;
    const birthDate = parsedBirthDate && !Number.isNaN(parsedBirthDate.getTime()) ? parsedBirthDate : null;

    const existingEntry = await prisma.draftPlayerPool.findFirst({
      where: { draftSessionId, fullName: { equals: fullName, mode: "insensitive" } },
      select: { id: true },
    });

    if (existingEntry) {
      await prisma.draftPlayerPool.update({
        where: { id: existingEntry.id },
        data: { firstName, lastName, guardianEmail, guardianPhone, birthDate },
      });
      updatedEntries += 1;
    } else {
      const createdEntry = await prisma.draftPlayerPool.create({
        data: { draftSessionId, firstName, lastName, fullName, guardianEmail, guardianPhone, birthDate },
        select: { id: true },
      });
      createdEntries += 1;
      createdEntryIds.push(createdEntry.id);
    }
  }

  return {
    processed,
    createdSessions,
    createdEntries,
    updatedEntries,
    skipped,
    createdEntryIds,
    createdSessionIds,
    sessionIdsByAgeGroup,
    skippedDetails,
  };
}
