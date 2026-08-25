import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

import { parseSeasonYear } from "@/lib/allStar/server";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export type Row = Record<string, string | number | boolean | null | undefined>;
export type UndoSnapshot = {
  createdTeamIds: string[];
  createdPlayerIds: string[];
  updatedPlayers: Array<{
    id: string;
    data: Record<string, unknown>;
  }>;
  /** DraftPlayerPool rows created for rows routed to a DRAFT-method age group — see lib/draft/draftPoolImport.ts. */
  createdDraftPoolEntryIds: string[];
  /** DraftSessions auto-created (not found-existing) alongside those pool entries — deleted on undo only if still empty. */
  createdDraftSessionIds: string[];
};
type ImportSkipDetail = {
  rowNumber: number | null;
  reason: string;
  playerName?: string;
  ageGroup?: string;
  teamName?: string;
};

export const PLAYER_IMPORT_DIVISION_KEYS = [
  "Division Name",
  "Division",
  "Program Division",
  "Program Name",
  "Age Group",
  "age_group",
  "AGE_GROUP",
];

export const PLAYER_IMPORT_TEAM_KEYS = [
  "Team Name",
  "Team",
  "Roster Team Name",
  "Assigned Team",
  "team_name",
  "assigned_team",
  "ASSIGNED_TEAM",
];

export const PLAYER_IMPORT_NAME_KEYS = [
  "Player Full Name",
  "Participant Full Name",
  "Participant Name",
  "Player Name",
  "Child Name",
  "Registrant Name",
  "Full Name",
  "Player",
  "full_name",
];

export const PLAYER_IMPORT_EMAIL_KEYS = [
  "User Email",
  "Account Email",
  "Parent Email",
  "Guardian Email",
  "Email",
  "email",
];

export function getRowValue(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const parsed = String(value).trim();
    if (parsed) return parsed;
  }
  return "";
}

function normalizeLooseName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSeasonYearFromProgramName(programName: string) {
  const match = programName.match(/\b(20\d{2})\b/);
  if (!match?.[1]) return null;
  return parseSeasonYear(match[1]);
}

export function splitName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] || null, lastName: null };
  }
  return {
    firstName: parts.slice(0, -1).join(" ") || null,
    lastName: parts.at(-1) || null,
  };
}

function parseBooleanValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "yes", "y", "1", "completed", "verified"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "not verified"].includes(normalized)) return false;
  return null;
}

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAllStarAgeBand(raw: string | null | undefined) {
  const value = String(raw || "").trim().toUpperCase();
  if (!value) return null;
  const uMatch = value.match(/^(\d{1,2})U$/);
  if (uMatch?.[1]) return `${Number.parseInt(uMatch[1], 10)}U`;
  const numericMatch = value.match(/^(\d{1,2})(?:\s*YEAR(?:S)?(?:\s*OLD)?)?$/);
  if (numericMatch?.[1]) return `${Number.parseInt(numericMatch[1], 10)}U`;
  return null;
}

function deriveAllStarAgeBandFromBirthDate(birthDate: Date | null, cutoffDate: Date | null) {
  if (!birthDate || !cutoffDate) return null;
  let age = cutoffDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = cutoffDate.getUTCMonth() - birthDate.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && cutoffDate.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }
  if (!Number.isInteger(age) || age < 4 || age > 18) return null;
  return `${age}U`;
}

function parseDivisionMappings(
  value: FormDataEntryValue | null,
): Map<string, string> {
  if (typeof value !== "string" || !value.trim()) return new Map();
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const mapping = new Map<string, string>();
    for (const [rawKey, rawValue] of Object.entries(parsed)) {
      const key = rawKey.trim().toLowerCase();
      const target =
        typeof rawValue === "string" ? rawValue.trim() : String(rawValue || "").trim();
      if (!key || !target) continue;
      mapping.set(key, target);
    }
    return mapping;
  } catch {
    return new Map();
  }
}

export function shouldSkipDivisionImport(divisionName: string) {
  const normalized = divisionName.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("modified tee ball")) return false;
  if (normalized.includes("umpire")) return true;
  if (normalized.includes("little league tee ball")) return true;
  if (normalized.includes("little league teeball")) return true;
  if (normalized.includes("3-4 year-old")) return true;
  if (normalized.includes("3-4 year olds")) return true;
  if (normalized.includes("3/4 year-old")) return true;
  if (normalized.includes("5 year-old")) return true;
  if (normalized.includes("5 year olds")) return true;
  return false;
}

export function emptyUndoPayload(): UndoSnapshot {
  return {
    createdTeamIds: [],
    createdPlayerIds: [],
    updatedPlayers: [],
    createdDraftPoolEntryIds: [],
    createdDraftSessionIds: [],
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const TEAM_PLAYER_UNDO_ALLOWED_FIELDS = new Set([
  "firstName",
  "lastName",
  "fullName",
  "contactPhone",
  "gender",
  "birthDate",
  "guardianFirstName",
  "guardianLastName",
  "guardianEmail",
  "guardianPhone",
  "paymentStatus",
  "birthCertificateStatus",
  "registrationOrderNo",
  "registrationOrderDate",
  "jerseySize",
  "medicalConditionsSummary",
  "medicalConditionsDetails",
  "medicalTreatmentAuthorized",
  "liabilityWaiverAccepted",
  "codeOfConductAccepted",
  "refundPolicyAccepted",
  "playedPriorSeason",
  "priorSeasonTeamInfo",
  "streetAddress",
  "unit",
  "city",
  "state",
  "postalCode",
  "rosterStatus",
  "jerseyNumber",
  "allStarAgeBand",
]);

function sanitizeUndoTeamPlayerData(data: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (TEAM_PLAYER_UNDO_ALLOWED_FIELDS.has(key)) {
      safe[key] = value;
    }
  }
  return safe;
}

export async function applyImportRows(params: {
  rows: Row[];
  targetOrg: string;
  adminId: string | null;
  explicitSeasonYear: number | null;
  divisionMappings: Map<string, string>;
  batchId: string;
  confirmedAgeGroup?: string | null;
  confirmedTeamName?: string | null;
  updateExistingOnly?: boolean;
  teamMappings?: Map<string, string>;
  allStarCutoffDate?: Date | null;
}) {
  const {
    rows,
    targetOrg,
    adminId,
    explicitSeasonYear,
    divisionMappings,
    batchId,
    confirmedAgeGroup,
    confirmedTeamName,
    updateExistingOnly = false,
    teamMappings = new Map(),
    allStarCutoffDate = null,
  } = params;
  let processed = 0;
  let createdTeams = 0;
  let createdPlayers = 0;
  let updatedPlayers = 0;
  let skipped = 0;
  let skippedByScope = 0;
  let skippedMissingExisting = 0;
  const skippedDetails: ImportSkipDetail[] = [];
  const teamCache = new Map<string, string>();
  const batch = await prisma.teamPlayerImportBatch.findUnique({
    where: { id: batchId },
    select: { undoPayload: true, status: true, organizationId: true, undoneAt: true },
  });
  if (!batch || batch.organizationId !== targetOrg || batch.undoneAt) {
    throw new Error("Import batch not found");
  }
  if (batch.status !== "RUNNING") {
    throw new Error("Import batch is not running");
  }
  const undoPayload = (batch.undoPayload ?? emptyUndoPayload()) as UndoSnapshot;
  const updatedSeen = new Set(undoPayload.updatedPlayers.map((entry) => entry.id));
  const pushSkipDetail = (
    row: Row,
    reason: string,
    context?: { playerName?: string; ageGroup?: string; teamName?: string },
  ) => {
    if (skippedDetails.length >= 20) return;
    const rawRowNumber = row.__importRowNumber;
    const parsedRowNumber =
      typeof rawRowNumber === "number"
        ? rawRowNumber
        : typeof rawRowNumber === "string"
          ? Number(rawRowNumber)
          : Number.NaN;
    skippedDetails.push({
      rowNumber: Number.isFinite(parsedRowNumber) && parsedRowNumber > 0 ? parsedRowNumber : null,
      reason,
      ...context,
    });
  };

  for (const row of rows) {
    processed += 1;
    const latestBatch = await prisma.teamPlayerImportBatch.findUnique({
      where: { id: batchId },
      select: { status: true },
    });
    if (!latestBatch || latestBatch.status !== "RUNNING") {
      break;
    }
    const rawAgeGroup = getRowValue(row, PLAYER_IMPORT_DIVISION_KEYS) || "";
    if (shouldSkipDivisionImport(rawAgeGroup)) {
      skipped += 1;
      pushSkipDetail(row, "Division is excluded from player imports", {
        ageGroup: rawAgeGroup || undefined,
      });
      continue;
    }
    const mappedAgeGroup = divisionMappings.get(rawAgeGroup.trim().toLowerCase());
    const ageGroup = mappedAgeGroup || rawAgeGroup;
    const rawTeamName = getRowValue(row, PLAYER_IMPORT_TEAM_KEYS) || "";
    const teamName = teamMappings.get(normalizeLooseName(rawTeamName)) || rawTeamName;
    const programName = getRowValue(row, ["Program Name", "Program", "Season", "season"]);
    const seasonYear = explicitSeasonYear || parseSeasonYearFromProgramName(programName);
    if (!ageGroup || !teamName || !seasonYear) {
      skipped += 1;
      pushSkipDetail(row, "Missing required age group, team name, or season year", {
        ageGroup: ageGroup || undefined,
        teamName: teamName || undefined,
      });
      continue;
    }
    if (
      confirmedAgeGroup &&
      ageGroup.trim().toLowerCase() !== confirmedAgeGroup.trim().toLowerCase()
    ) {
      skipped += 1;
      skippedByScope += 1;
      pushSkipDetail(row, "Outside confirmed import scope (age group mismatch)", {
        ageGroup,
        teamName,
      });
      continue;
    }
    if (
      confirmedTeamName &&
      teamName.trim().toLowerCase() !== confirmedTeamName.trim().toLowerCase()
    ) {
      skipped += 1;
      skippedByScope += 1;
      pushSkipDetail(row, "Outside confirmed import scope (team mismatch)", {
        ageGroup,
        teamName,
      });
      continue;
    }
    const fullName =
      getRowValue(row, PLAYER_IMPORT_NAME_KEYS) ||
      [
        getRowValue(row, ["Player First Name", "Participant First Name", "First Name", "first_name"]),
        getRowValue(row, ["Player Last Name", "Participant Last Name", "Last Name", "last_name"]),
      ]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      [
        getRowValue(row, ["Account First Name", "Parent First Name", "Guardian First Name"]),
        getRowValue(row, ["Account Last Name", "Parent Last Name", "Guardian Last Name"]),
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (!fullName) {
      skipped += 1;
      pushSkipDetail(row, "Missing player full name", {
        ageGroup,
        teamName,
      });
      continue;
    }
    const contactPhone = getRowValue(row, [
      "Player Telephone",
      "Participant Phone",
      "Player Phone",
      "Player Cellphone",
      "Parent Phone",
      "Telephone",
      "Cellphone",
      "Other Phone",
      "Phone",
      "phone",
    ]);
    const guardianFirstName = getRowValue(row, [
      "Account First Name",
      "Parent First Name",
      "Guardian First Name",
    ]);
    const guardianLastName = getRowValue(row, [
      "Account Last Name",
      "Parent Last Name",
      "Guardian Last Name",
    ]);
    const guardianEmail = getRowValue(row, PLAYER_IMPORT_EMAIL_KEYS);
    const guardianPhone = getRowValue(row, [
      "Telephone",
      "Account Phone",
      "Cellphone",
      "Other Phone",
      "Parent Phone",
      "Guardian Phone",
      "Phone",
    ]);
    const gender = getRowValue(row, ["Player Gender", "Participant Gender", "Gender"]);
    const birthDate = parseDateValue(
      getRowValue(row, ["Player Birth Date", "Participant Birth Date", "Birth Date", "DOB"]),
    );
    const orderPaymentStatus = getRowValue(row, [
      "Order Payment Status",
      "Payment Status",
      "Balance Status",
    ]);
    const birthCertStatus = getRowValue(row, ["Birth Certificate Upload", "Birth Certificate"]);
    const rosterStatus =
      getRowValue(row, ["Roster Status", "Status", "status"]) ||
      [orderPaymentStatus, birthCertStatus].filter(Boolean).join(" | ") ||
      null;
    const registrationOrderNo = getRowValue(row, ["Order No", "Order Number", "Order ID"]);
    const registrationOrderDate = parseDateValue(getRowValue(row, ["Order Date", "Registration Date"]));
    const jerseyNumber =
      getRowValue(row, [
        "Jersey Number",
        "Jersey",
        "jersey_number",
      ]) || null;
    const jerseySize =
      getRowValue(row, [
        "What is the players jersey size?",
        "Jersey Size",
        "Shirt Size",
        "Uniform Size",
      ]) || null;
    const explicitAllStarAgeBand = parseAllStarAgeBand(
      getRowValue(row, [
        "All-Star Age Band",
        "All Star Age Band",
        "all_star_age_band",
        "Age Band",
      ]),
    );
    const medicalConditionsSummary = getRowValue(row, [
      "Are there any physical / medical conditions or allergies that the staff need to be aware of?",
      "Medical Conditions",
      "Allergies",
    ]);
    const medicalConditionsDetails = getRowValue(row, [
      "If YES to above, please explain / describe the condition.",
      "Medical Condition Details",
    ]);
    const medicalTreatmentAuthorized = parseBooleanValue(
      getRowValue(row, ["Medical Treatment Authorization"]),
    );
    const liabilityWaiverAccepted = parseBooleanValue(getRowValue(row, ["Liability Waiver"]));
    const codeOfConductAccepted = parseBooleanValue(getRowValue(row, ["CODE OF CONDUCT"]));
    const refundPolicyAccepted = parseBooleanValue(getRowValue(row, ["REFUND POLICY"]));
    const playedPriorSeason = parseBooleanValue(
      getRowValue(row, ["Did you play in the Gonzales DYB Spring/Summer 2025 Season?"]),
    );
    const priorSeasonTeamInfo = getRowValue(row, ["If YES, to above, which team and age group?"]);
    const streetAddress = getRowValue(row, ["Street Address", "Address", "Address Line 1"]);
    const unit = getRowValue(row, ["Unit", "Address Line 2"]);
    const city = getRowValue(row, ["City"]);
    const state = getRowValue(row, ["State"]);
    const postalCode = getRowValue(row, ["Postal Code", "Zip", "Zip Code"]);
    const { firstName, lastName } = splitName(fullName);

    const teamKey = `${targetOrg}::${seasonYear}::${ageGroup.toLowerCase()}::${teamName.toLowerCase()}`;
    let teamId = teamCache.get(teamKey);
    if (!teamId) {
      const existingTeam = await prisma.team.findUnique({
        where: {
          organizationId_seasonYear_ageGroup_teamName: {
            organizationId: targetOrg,
            seasonYear,
            ageGroup,
            teamName,
          },
        },
        select: { id: true },
      });
      const team = existingTeam
        ? existingTeam
        : updateExistingOnly
          ? null
        : await prisma.team.create({
            data: {
              organizationId: targetOrg,
              seasonYear,
              ageGroup,
              teamName,
              createdByAdminId: adminId,
            },
            select: { id: true },
          });
      if (!team) {
        skipped += 1;
        skippedMissingExisting += 1;
        pushSkipDetail(row, "Team not found in existing roster (update-only mode)", {
          playerName: fullName,
          ageGroup,
          teamName,
        });
        continue;
      }
      teamId = team.id;
      teamCache.set(teamKey, team.id);
      if (!existingTeam) {
        createdTeams += 1;
        if (!undoPayload.createdTeamIds.includes(team.id)) {
          undoPayload.createdTeamIds.push(team.id);
        }
      }
    }

    const existingPlayer = await prisma.teamPlayer.findFirst({
      where: { teamId, fullName: { equals: fullName, mode: "insensitive" } },
    });
    if (updateExistingOnly && !existingPlayer) {
      skipped += 1;
      skippedMissingExisting += 1;
      pushSkipDetail(row, "Player not found in existing roster (update-only mode)", {
        playerName: fullName,
        ageGroup,
        teamName,
      });
      continue;
    }
    const derivedAllStarAgeBand = deriveAllStarAgeBandFromBirthDate(
      birthDate || existingPlayer?.birthDate || null,
      allStarCutoffDate,
    );
    const createData = {
      teamId,
      firstName,
      lastName,
      fullName,
      contactPhone: contactPhone || null,
      gender: gender || null,
      birthDate,
      guardianFirstName: guardianFirstName || null,
      guardianLastName: guardianLastName || null,
      guardianEmail: guardianEmail || null,
      guardianPhone: guardianPhone || null,
      paymentStatus: orderPaymentStatus || null,
      birthCertificateStatus: birthCertStatus || null,
      registrationOrderNo: registrationOrderNo || null,
      registrationOrderDate,
      jerseySize,
      medicalConditionsSummary: medicalConditionsSummary || null,
      medicalConditionsDetails: medicalConditionsDetails || null,
      medicalTreatmentAuthorized,
      liabilityWaiverAccepted,
      codeOfConductAccepted,
      refundPolicyAccepted,
      playedPriorSeason,
      priorSeasonTeamInfo: priorSeasonTeamInfo || null,
      streetAddress: streetAddress || null,
      unit: unit || null,
      city: city || null,
      state: state || null,
      postalCode: postalCode || null,
      rosterStatus,
      jerseyNumber,
      allStarAgeBand: explicitAllStarAgeBand || derivedAllStarAgeBand,
    };
    const updateData: Record<string, unknown> = {
      firstName,
      lastName,
      fullName,
    };
    if (contactPhone) updateData.contactPhone = contactPhone;
    if (gender) updateData.gender = gender;
    if (birthDate) updateData.birthDate = birthDate;
    if (guardianFirstName) updateData.guardianFirstName = guardianFirstName;
    if (guardianLastName) updateData.guardianLastName = guardianLastName;
    if (guardianEmail) updateData.guardianEmail = guardianEmail;
    if (guardianPhone) updateData.guardianPhone = guardianPhone;
    if (orderPaymentStatus) updateData.paymentStatus = orderPaymentStatus;
    if (birthCertStatus) updateData.birthCertificateStatus = birthCertStatus;
    if (registrationOrderNo) updateData.registrationOrderNo = registrationOrderNo;
    if (registrationOrderDate) updateData.registrationOrderDate = registrationOrderDate;
    if (jerseySize) updateData.jerseySize = jerseySize;
    if (medicalConditionsSummary) updateData.medicalConditionsSummary = medicalConditionsSummary;
    if (medicalConditionsDetails) updateData.medicalConditionsDetails = medicalConditionsDetails;
    if (medicalTreatmentAuthorized !== null)
      updateData.medicalTreatmentAuthorized = medicalTreatmentAuthorized;
    if (liabilityWaiverAccepted !== null) updateData.liabilityWaiverAccepted = liabilityWaiverAccepted;
    if (codeOfConductAccepted !== null) updateData.codeOfConductAccepted = codeOfConductAccepted;
    if (refundPolicyAccepted !== null) updateData.refundPolicyAccepted = refundPolicyAccepted;
    if (playedPriorSeason !== null) updateData.playedPriorSeason = playedPriorSeason;
    if (priorSeasonTeamInfo) updateData.priorSeasonTeamInfo = priorSeasonTeamInfo;
    if (streetAddress) updateData.streetAddress = streetAddress;
    if (unit) updateData.unit = unit;
    if (city) updateData.city = city;
    if (state) updateData.state = state;
    if (postalCode) updateData.postalCode = postalCode;
    if (rosterStatus) updateData.rosterStatus = rosterStatus;
    if (jerseyNumber) updateData.jerseyNumber = jerseyNumber;
    if (explicitAllStarAgeBand || derivedAllStarAgeBand) {
      updateData.allStarAgeBand = explicitAllStarAgeBand || derivedAllStarAgeBand;
    }
    if (existingPlayer) {
      if (!updatedSeen.has(existingPlayer.id)) {
        undoPayload.updatedPlayers.push({
          id: existingPlayer.id,
          data: {
            firstName: existingPlayer.firstName,
            lastName: existingPlayer.lastName,
            fullName: existingPlayer.fullName,
            contactPhone: existingPlayer.contactPhone,
            gender: existingPlayer.gender,
            birthDate: existingPlayer.birthDate,
            guardianFirstName: existingPlayer.guardianFirstName,
            guardianLastName: existingPlayer.guardianLastName,
            guardianEmail: existingPlayer.guardianEmail,
            guardianPhone: existingPlayer.guardianPhone,
            paymentStatus: existingPlayer.paymentStatus,
            birthCertificateStatus: existingPlayer.birthCertificateStatus,
            registrationOrderNo: existingPlayer.registrationOrderNo,
            registrationOrderDate: existingPlayer.registrationOrderDate,
            jerseySize: existingPlayer.jerseySize,
            medicalConditionsSummary: existingPlayer.medicalConditionsSummary,
            medicalConditionsDetails: existingPlayer.medicalConditionsDetails,
            medicalTreatmentAuthorized: existingPlayer.medicalTreatmentAuthorized,
            liabilityWaiverAccepted: existingPlayer.liabilityWaiverAccepted,
            codeOfConductAccepted: existingPlayer.codeOfConductAccepted,
            refundPolicyAccepted: existingPlayer.refundPolicyAccepted,
            playedPriorSeason: existingPlayer.playedPriorSeason,
            priorSeasonTeamInfo: existingPlayer.priorSeasonTeamInfo,
            streetAddress: existingPlayer.streetAddress,
            unit: existingPlayer.unit,
            city: existingPlayer.city,
            state: existingPlayer.state,
            postalCode: existingPlayer.postalCode,
            rosterStatus: existingPlayer.rosterStatus,
            jerseyNumber: existingPlayer.jerseyNumber,
            allStarAgeBand: existingPlayer.allStarAgeBand,
          },
        });
        updatedSeen.add(existingPlayer.id);
      }
      await prisma.teamPlayer.update({ where: { id: existingPlayer.id }, data: updateData });
      updatedPlayers += 1;
    } else {
      const createdPlayer = await prisma.teamPlayer.create({ data: createData });
      createdPlayers += 1;
      undoPayload.createdPlayerIds.push(createdPlayer.id);
    }
  }

  const nextBatch = await prisma.teamPlayerImportBatch.update({
    where: { id: batchId },
    data: {
      processedRows: { increment: processed },
      createdTeams: { increment: createdTeams },
      createdPlayers: { increment: createdPlayers },
      updatedPlayers: { increment: updatedPlayers },
      skippedRows: { increment: skipped },
      undoPayload: toInputJson(undoPayload),
    },
    select: {
      id: true,
      status: true,
      totalRows: true,
      processedRows: true,
      createdTeams: true,
      createdPlayers: true,
      updatedPlayers: true,
      skippedRows: true,
      completedAt: true,
    },
  });
  return { batch: nextBatch, skippedByScope, skippedMissingExisting, skippedDetails };
}

export async function undoBatch(targetOrg: string, batchId?: string) {
  const batch = batchId
    ? await prisma.teamPlayerImportBatch.findFirst({
        where: { id: batchId, organizationId: targetOrg, undoneAt: null },
      })
    : await prisma.teamPlayerImportBatch.findFirst({
        where: { organizationId: targetOrg, undoneAt: null },
        orderBy: { createdAt: "desc" },
      });
  if (!batch) throw new Error("No import batch available to undo");
  const undoPayload = (batch.undoPayload ?? emptyUndoPayload()) as UndoSnapshot;
  const updatedAttempted = undoPayload.updatedPlayers.length;
  let restoredUpdated = 0;
  for (const entry of undoPayload.updatedPlayers) {
    const safeData = sanitizeUndoTeamPlayerData(entry.data);
    if (Object.keys(safeData).length === 0) continue;
    // Use updateMany so missing rows don't abort the entire undo.
    const result = await prisma.teamPlayer.updateMany({
      where: { id: entry.id },
      data: safeData,
    });
    restoredUpdated += result.count;
  }
  let deletedPlayers = 0;
  if (undoPayload.createdPlayerIds.length > 0) {
    const deleted = await prisma.teamPlayer.deleteMany({
      where: { id: { in: undoPayload.createdPlayerIds } },
    });
    deletedPlayers = deleted.count;
  }
  let deletedTeams = 0;
  if (undoPayload.createdTeamIds.length > 0) {
    const deleted = await prisma.team.deleteMany({
      where: { id: { in: undoPayload.createdTeamIds }, organizationId: targetOrg },
    });
    deletedTeams = deleted.count;
  }
  // Entries already drafted (isDrafted: true) are left alone rather than deleted out from
  // under a DraftPick/materialized roster — same "undo is precise, not destructive" contract
  // as the createdPlayerIds/createdTeamIds deletes above.
  const draftPoolEntryIds = undoPayload.createdDraftPoolEntryIds || [];
  const deletedDraftPoolEntries =
    draftPoolEntryIds.length > 0
      ? (
          await prisma.draftPlayerPool.deleteMany({
            where: { id: { in: draftPoolEntryIds }, isDrafted: false },
          })
        ).count
      : 0;
  // Sessions this batch auto-created (not found-existing) get deleted too, but only if they're
  // still empty after the entry deletion above — if a pick was made, another import added more
  // pool entries, or an admin configured teams/timer since, the session has state beyond what
  // this batch created and undo leaves it alone rather than destroying that.
  const draftSessionIds = undoPayload.createdDraftSessionIds || [];
  let deletedDraftSessions = 0;
  for (const sessionId of draftSessionIds) {
    const session = await prisma.draftSession.findUnique({
      where: { id: sessionId },
      select: { _count: { select: { playerPool: true, teams: true, picks: true } } },
    });
    if (!session) continue;
    if (session._count.playerPool === 0 && session._count.teams === 0 && session._count.picks === 0) {
      await prisma.draftSession.delete({ where: { id: sessionId } });
      deletedDraftSessions += 1;
    }
  }
  await prisma.teamPlayerImportBatch.update({
    where: { id: batch.id },
    data: { status: "UNDONE", undoneAt: new Date(), completedAt: new Date() },
  });
  return {
    batchId: batch.id,
    restoredUpdated,
    skippedMissingUpdated: Math.max(0, updatedAttempted - restoredUpdated),
    deletedPlayers,
    deletedTeams,
    deletedDraftPoolEntries,
    deletedDraftSessions,
  };
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }
  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const batchId = request.nextUrl.searchParams.get("batchId")?.trim();
  const mode = request.nextUrl.searchParams.get("mode")?.trim();
  if (mode === "history") {
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "5");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5;
    const history = await prisma.teamPlayerImportBatch.findMany({
      where: { organizationId: targetOrg },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        totalRows: true,
        processedRows: true,
        createdTeams: true,
        createdPlayers: true,
        updatedPlayers: true,
        skippedRows: true,
        createdAt: true,
        completedAt: true,
        undoneAt: true,
      },
    });
    return NextResponse.json({ data: history });
  }
  if (!batchId) {
    const latest = await prisma.teamPlayerImportBatch.findFirst({
      where: { organizationId: targetOrg },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: latest || null });
  }
  const batch = await prisma.teamPlayerImportBatch.findFirst({
    where: { id: batchId, organizationId: targetOrg },
  });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  return NextResponse.json({ data: batch });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const admin = await getAdminUserFromRequest(request);
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as
      | { mode?: "start"; totalRows?: number }
      | {
          mode?: "chunk";
          batchId?: string;
          rows?: Row[];
          seasonYear?: number | string | null;
          divisionMappings?: Record<string, string>;
          confirmedAgeGroup?: string | null;
          confirmedTeamName?: string | null;
          updateExistingOnly?: boolean;
          teamMappings?: Record<string, string>;
          allStarCutoffDate?: string | null;
        }
      | { mode?: "complete"; batchId?: string }
      | { mode?: "cancel"; batchId?: string }
      | { mode?: "undo"; batchId?: string };
    if (body.mode === "start") {
      const created = await prisma.teamPlayerImportBatch.create({
        data: {
          organizationId: targetOrg,
          createdByAdminId: admin?.id || null,
          status: "RUNNING",
          totalRows:
            typeof body.totalRows === "number" && body.totalRows > 0 ? body.totalRows : 0,
          undoPayload: toInputJson(emptyUndoPayload()),
        },
      });
      return NextResponse.json({ success: true, batch: created });
    }
    if (body.mode === "chunk") {
      const batchId = typeof body.batchId === "string" ? body.batchId : "";
      if (!batchId || !Array.isArray(body.rows)) {
        return NextResponse.json({ error: "batchId and rows are required" }, { status: 400 });
      }
      const explicitSeasonYear = parseSeasonYear(String(body.seasonYear || ""));
      const divisionMappings = new Map<string, string>();
      const rawMap =
        body.divisionMappings && typeof body.divisionMappings === "object"
          ? body.divisionMappings
          : {};
      for (const [division, mapped] of Object.entries(rawMap)) {
        const key = division.trim().toLowerCase();
        const val = String(mapped || "").trim();
        if (key && val) divisionMappings.set(key, val);
      }
      const teamMappings = new Map<string, string>();
      const rawTeamMap =
        body.teamMappings && typeof body.teamMappings === "object" ? body.teamMappings : {};
      for (const [source, mapped] of Object.entries(rawTeamMap)) {
        const from = normalizeLooseName(source);
        const to = String(mapped || "").trim();
        if (from && to) teamMappings.set(from, to);
      }
      const allStarCutoffDate =
        typeof body.allStarCutoffDate === "string" && body.allStarCutoffDate.trim()
          ? new Date(body.allStarCutoffDate)
          : null;
      const updated = await applyImportRows({
        rows: body.rows,
        targetOrg,
        adminId: admin?.id || null,
        explicitSeasonYear,
        divisionMappings,
        batchId,
        confirmedAgeGroup:
          typeof body.confirmedAgeGroup === "string" ? body.confirmedAgeGroup : null,
        confirmedTeamName:
          typeof body.confirmedTeamName === "string" ? body.confirmedTeamName : null,
        updateExistingOnly: body.updateExistingOnly === true,
        teamMappings,
        allStarCutoffDate:
          allStarCutoffDate && !Number.isNaN(allStarCutoffDate.getTime())
            ? allStarCutoffDate
            : null,
      });
      return NextResponse.json({
        success: true,
        batch: updated.batch,
        skippedByScope: updated.skippedByScope,
        skippedMissingExisting: updated.skippedMissingExisting,
        skippedDetails: updated.skippedDetails,
      });
    }
    if (body.mode === "complete") {
      const batchId = typeof body.batchId === "string" ? body.batchId : "";
      if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });
      const completed = await prisma.teamPlayerImportBatch.update({
        where: { id: batchId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      return NextResponse.json({ success: true, batch: completed });
    }
    if (body.mode === "cancel") {
      const batchId = typeof body.batchId === "string" ? body.batchId : "";
      if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });
      await prisma.teamPlayerImportBatch.update({
        where: { id: batchId },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }
    if (body.mode === "undo") {
      try {
        const undone = await undoBatch(
          targetOrg,
          typeof body.batchId === "string" ? body.batchId : undefined,
        );
        return NextResponse.json({ success: true, ...undone });
      } catch (error: unknown) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Failed to undo import" },
          { status: 400 },
        );
      }
    }
    return NextResponse.json({ error: "Unsupported import mode" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const divisionMappings = parseDivisionMappings(formData.get("divisionMappings"));
  const teamMappings = parseDivisionMappings(formData.get("teamMappings"));
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV or XLSX file is required" }, { status: 400 });
  }
  const explicitSeasonYear = parseSeasonYear(String(formData.get("seasonYear") || ""));
  const confirmedAgeGroup =
    typeof formData.get("confirmedAgeGroup") === "string"
      ? String(formData.get("confirmedAgeGroup") || "").trim()
      : "";
  const confirmedTeamName =
    typeof formData.get("confirmedTeamName") === "string"
      ? String(formData.get("confirmedTeamName") || "").trim()
      : "";
  const updateExistingOnly =
    String(formData.get("updateExistingOnly") || "").trim().toLowerCase() === "true";
  const allStarCutoffDate =
    typeof formData.get("allStarCutoffDate") === "string" &&
    String(formData.get("allStarCutoffDate") || "").trim()
      ? new Date(String(formData.get("allStarCutoffDate")))
      : null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!firstSheet) {
    return NextResponse.json({ error: "Unable to read uploaded file" }, { status: 400 });
  }
  const rows = XLSX.utils.sheet_to_json<Row>(firstSheet, { defval: "", raw: false });
  if (rows.length === 0) {
    return NextResponse.json({ error: "Uploaded file has no rows" }, { status: 400 });
  }
  const createdBatch = await prisma.teamPlayerImportBatch.create({
    data: {
      organizationId: targetOrg,
      createdByAdminId: admin?.id || null,
      status: "RUNNING",
      totalRows: rows.length,
      undoPayload: toInputJson(emptyUndoPayload()),
    },
  });
  const batch = await applyImportRows({
    rows,
    targetOrg,
    adminId: admin?.id || null,
    explicitSeasonYear,
    divisionMappings,
    batchId: createdBatch.id,
    confirmedAgeGroup,
    confirmedTeamName,
    updateExistingOnly,
    teamMappings,
    allStarCutoffDate:
      allStarCutoffDate && !Number.isNaN(allStarCutoffDate.getTime())
        ? allStarCutoffDate
        : null,
  });
  await prisma.teamPlayerImportBatch.update({
    where: { id: createdBatch.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  return NextResponse.json({
    success: true,
    processed: batch.batch.processedRows,
    createdTeams: batch.batch.createdTeams,
    createdPlayers: batch.batch.createdPlayers,
    updatedPlayers: batch.batch.updatedPlayers,
    skipped: batch.batch.skippedRows,
    skippedByScope: batch.skippedByScope,
    skippedMissingExisting: batch.skippedMissingExisting,
    batchId: createdBatch.id,
  });
}
