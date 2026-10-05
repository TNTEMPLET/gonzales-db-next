import { createHash } from "node:crypto";

import { shouldSkipDivisionImport } from "@/lib/admin/teamsImportHelpers";

import {
  canSplitSpringProgram,
  isFallProgramName,
  isSpringProgramName,
  isSpringSplitOrg,
  placeDivision,
  type SpringSplitOrg,
  type UnplaceableReason,
} from "./divisionLeagueSplit";
import { deriveSportsConnectRowKey, playerRegRowFullName } from "./enrollmentRowKey";
import {
  isAllowedSportsConnectExportName,
  parseSportsConnectExportBuffer,
  SPORTS_CONNECT_INGEST_MAX_ROWS,
} from "./parseExportBuffer";
import { PLAYER_REG_HISTORY_REPORT_KIND } from "./registrationHistoryKind";
import { springEnrollmentSeasonYears } from "./springEnrollmentLock";

export { canSplitSpringProgram, isFallProgramName, isSpringProgramName };

export { PLAYER_REG_HISTORY_REPORT_KIND };

export const HISTORY_ORG_IDS = ["gonzales", "ascension", "fallball"] as const;
export type HistoryOrgId = (typeof HISTORY_ORG_IDS)[number];

const HISTORY_ORG_SET = new Set<string>(HISTORY_ORG_IDS);

export const SKIP_REASONS = [
  "unmapped_or_fall",
  "not_completed",
  "umpire",
  "missing_birth_date",
  "unparseable",
] as const;
export type HistorySkipReason = (typeof SKIP_REASONS)[number];

export const EXCLUDED_RAW_ROW_COLUMN_NAMES = [
  "Are there any physical / medical conditions or allergies that the staff need to be aware of?",
  "Medical Conditions",
  "Allergies",
  "If YES to above, please explain / describe the condition.",
  "Medical Condition Details",
  "Medical Treatment Authorization",
  "Insurance Company",
  "Insurance Policy Number",
  "Policy Number",
  "Physician",
  "Physician Name",
  "Physician Phone",
  "Doctor Name",
  "Doctor Phone",
  "Primary Physician",
  "Health Insurance",
  "Health Insurance Provider",
  "Medications",
] as const;

const EXCLUDED_RAW_COLUMN_PATTERNS = [
  /medical/i,
  /allerg/i,
  /insur/i,
  /physician/i,
  /\bdoctor\b/i,
  /\bhealth\b/i,
  /medications?/i,
  /describe the condition/i,
];

const EXCLUDED_RAW_COLUMN_NAME_SET = new Set(
  EXCLUDED_RAW_ROW_COLUMN_NAMES.map((name) => name.toLowerCase()),
);

const PROGRAM_KEYS = ["Program Name", "Program"];
const DIVISION_KEYS = ["Division Name", "Division", "Program Division"];
const ORDER_NO_KEYS = ["Order No", "Order Number", "Order ID"];
const BIRTH_DATE_KEYS = ["Player Birth Date", "Participant Birth Date", "Birth Date", "DOB"];
const PAYMENT_KEYS = ["Order Payment Status", "Payment Status"];
const FIRST_NAME_KEYS = ["Player First Name", "Participant First Name", "First Name"];
const LAST_NAME_KEYS = ["Player Last Name", "Participant Last Name", "Last Name"];
const GENDER_KEYS = ["Player Gender", "Gender"];
const PLAYER_ID_KEYS = ["Player ID", "Player Id", "SportsConnect Player ID"];
const TEAM_KEYS = ["Team Name", "Team"];
const ORDER_DATE_KEYS = ["Order Date", "Registration Date"];
const ORDER_DETAIL_KEYS = ["Order Detail Description", "Order Item Description", "Description"];
const AMOUNT_KEYS = ["OrderItem Amount", "Order Item Amount", "Amount"];
const AMOUNT_PAID_KEYS = ["OrderItem Amount Paid", "Order Item Amount Paid", "Amount Paid"];
const BALANCE_KEYS = ["OrderItem Balance", "Order Item Balance", "Balance"];
const GUARDIAN_FIRST_KEYS = ["Account First Name", "Parent First Name", "Guardian First Name"];
const GUARDIAN_LAST_KEYS = ["Account Last Name", "Parent Last Name", "Guardian Last Name"];
const EMAIL_KEYS = ["User Email", "Guardian Email", "Parent Email", "Email"];
const GUARDIAN_PHONE_KEYS = ["Guardian Phone", "Parent Phone", "Cell Phone", "Cellphone"];
const CONTACT_PHONE_KEYS = ["Player Telephone", "Telephone", "Phone"];
const STREET_KEYS = ["Street Address", "Address", "Address Line 1"];
const UNIT_KEYS = ["Unit", "Address Line 2"];
const CITY_KEYS = ["City"];
const STATE_KEYS = ["State"];
const POSTAL_KEYS = ["Postal Code", "Zip", "Zip Code"];

const NO_PROGRAM = "(no program)";

export class RegistrationHistoryError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RegistrationHistoryError";
    this.status = status;
  }
}

export type DivisionLeagueOverride = {
  divisionName: string;
  organizationId: SpringSplitOrg;
};

export type HistoryMappingEntry = {
  programName: string;
  action: string;
  organizationId?: string;
  seasonYear?: number;
  divisionOverrides?: Array<{ divisionName?: string; organizationId?: string }>;
};

export type NormalizedHistoryMappingEntry =
  | { programName: string; action: "skip" }
  | {
      programName: string;
      action: "map";
      organizationId: HistoryOrgId;
      seasonYear: number;
    }
  | {
      programName: string;
      action: "split";
      seasonYear: number;
      divisionOverrides: DivisionLeagueOverride[];
    };

export type HistorySkipCounts = Record<HistorySkipReason, number>;

export type HistoryDivisionCounts = {
  divisionName: string;
  wouldAdd: number;
  alreadyPresent: number;
  skipped: HistorySkipCounts;
  organizationId?: SpringSplitOrg | null;
  alreadySameLeague?: number;
  alreadyOtherLeague?: number;
  unplaceable?: number;
  placement?: "tag" | "fixed" | "override" | "unplaceable";
  unplaceableReason?: UnplaceableReason | null;
};

export type HistoryLeagueTotals = {
  organizationId: SpringSplitOrg;
  seasonYear: number;
  wouldAdd: number;
  alreadySameLeague: number;
  alreadyOtherLeague: number;
  amountCents: number;
  amountPaidCents: number;
  balanceCents: number;
};

export type UnplaceableDivision = {
  programName: string;
  divisionName: string;
  rowCount: number;
  reason: UnplaceableReason;
};

export type HistoryProgramCounts = {
  programName: string;
  rowCount: number;
  fallLocked: boolean;
  disposition: "skip" | "map" | "split";
  organizationId: HistoryOrgId | null;
  seasonYear: number | null;
  divisions: HistoryDivisionCounts[];
  leagues: HistoryLeagueTotals[];
  totals: {
    wouldAdd: number;
    alreadyPresent: number;
    skipped: HistorySkipCounts;
    unplaceable: number;
    alreadySameLeague: number;
    alreadyOtherLeague: number;
  };
};

export type HistoryPreview = {
  fileName: string;
  fileSha256: string;
  totalRows: number;
  birthDateCoveragePercent: number;
  totals: {
    wouldAdd: number;
    alreadyPresent: number;
    skipped: HistorySkipCounts;
    unplaceable: number;
    alreadySameLeague: number;
    alreadyOtherLeague: number;
  };
  programs: HistoryProgramCounts[];
  leagues: HistoryLeagueTotals[];
  unplaceable: UnplaceableDivision[];
  mapping: NormalizedHistoryMappingEntry[];
  keyNote: string;
};

export type HistoryEnrollmentInsert = {
  organizationId: HistoryOrgId;
  seasonYear: number;
  sportsConnectRowKey: string;
  programName: string;
  divisionNameRaw: string | null;
  ageGroup: string;
  teamNameRaw: string | null;
  teamId: null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  gender: string | null;
  birthDate: Date;
  guardianFirstName: string | null;
  guardianLastName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  contactPhone: string | null;
  streetAddress: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  sportsConnectOrderNo: string | null;
  orderDate: Date | null;
  orderDetailDescription: string | null;
  orderPaymentStatus: string;
  amountCents: number | null;
  amountPaidCents: number | null;
  balanceCents: number | null;
  sportsConnectPlayerId: string | null;
  rawRow: Record<string, unknown>;
};

export type ExistingHistoryKey = {
  organizationId: string;
  seasonYear: number;
  sportsConnectRowKey: string;
};

export type ProgramInventoryEntry = {
  programName: string;
  rowCount: number;
  suggestion: ReturnType<typeof suggestProgramMapping>;
  springSplitEligible: boolean;
};

const KEY_NOTE =
  "Would-add counts a new organization, season, and order-line key. A repeated key in this file, or a key already stored, counts as already present and is left unchanged.";

const SPLIT_KEY_NOTE =
  "Would-add counts a new player for that league. A repeated row in this file, or a player already stored for this season in Gonzales or Ascension, is left where they are. If this file would place them in the other league, they are counted and not moved.";

export function suggestProgramMapping(programName: string): {
  action: "skip" | "map";
  organizationId: HistoryOrgId | null;
  seasonYear: number | null;
  fallLocked: boolean;
} {
  if (isFallProgramName(programName)) {
    return { action: "skip", organizationId: null, seasonYear: null, fallLocked: true };
  }
  const norm = programName.trim().toLowerCase().replace(/\s+/g, " ");
  const yearMatch = norm.match(/\b(20\d{2})\b/);
  const seasonYear = yearMatch ? Number(yearMatch[1]) : 2026;
  if (norm.includes("gonzales") && norm.includes("spring")) {
    return { action: "map", organizationId: "gonzales", seasonYear, fallLocked: false };
  }
  if (norm.includes("ascension") && norm.includes("spring")) {
    return { action: "map", organizationId: "ascension", seasonYear, fallLocked: false };
  }
  if (isSpringProgramName(programName)) {
    return { action: "skip", organizationId: null, seasonYear, fallLocked: false };
  }
  return { action: "skip", organizationId: null, seasonYear: null, fallLocked: false };
}

export function isExcludedRawColumn(header: string): boolean {
  const name = header.trim();
  if (!name) return false;
  if (EXCLUDED_RAW_COLUMN_NAME_SET.has(name.toLowerCase())) return true;
  return EXCLUDED_RAW_COLUMN_PATTERNS.some((pattern) => pattern.test(name));
}

export function minimizeRawRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (isExcludedRawColumn(key)) continue;
    out[key] = value;
  }
  return out;
}

export function isCompletedPaymentStatus(value: string): boolean {
  return value.trim().replace(/\s+/g, " ").toLowerCase() === "completed";
}

export function sha256FileBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function emptySkipCounts(): HistorySkipCounts {
  return {
    unmapped_or_fall: 0,
    not_completed: 0,
    umpire: 0,
    missing_birth_date: 0,
    unparseable: 0,
  };
}

export function canonicalHistoryMapping(mapping: NormalizedHistoryMappingEntry[]): string {
  const sorted = [...mapping].sort((a, b) => a.programName.localeCompare(b.programName));
  return JSON.stringify(sorted);
}

export function historyCountsSignature(preview: HistoryPreview): string {
  return JSON.stringify({
    totalRows: preview.totalRows,
    birthDateCoveragePercent: preview.birthDateCoveragePercent,
    totals: preview.totals,
    leagues: preview.leagues,
    unplaceable: preview.unplaceable,
    programs: preview.programs.map((program) => ({
      programName: program.programName,
      disposition: program.disposition,
      organizationId: program.organizationId,
      seasonYear: program.seasonYear,
      divisions: program.divisions,
      leagues: program.leagues,
      totals: program.totals,
    })),
  });
}

export function existingKeyTargets(
  mapping: readonly NormalizedHistoryMappingEntry[],
): Array<{ organizationId: string; seasonYear: number }> {
  const targets: Array<{ organizationId: string; seasonYear: number }> = [];
  const seen = new Set<string>();
  const add = (organizationId: string, seasonYear: number) => {
    const id = `${organizationId}\0${seasonYear}`;
    if (seen.has(id)) return;
    seen.add(id);
    targets.push({ organizationId, seasonYear });
  };
  for (const entry of mapping) {
    if (entry.action === "map") add(entry.organizationId, entry.seasonYear);
    if (entry.action === "split") {
      add("gonzales", entry.seasonYear);
      add("ascension", entry.seasonYear);
    }
  }
  return targets;
}

/** Key reads for a Spring Gonzales/Ascension write include both leagues. */
export function enrollmentReadTargets(
  mapping: readonly NormalizedHistoryMappingEntry[],
): Array<{ organizationId: string; seasonYear: number }> {
  const targets = existingKeyTargets(mapping);
  const seen = new Set(targets.map((target) => `${target.organizationId}\0${target.seasonYear}`));
  for (const seasonYear of springEnrollmentSeasonYears(mapping)) {
    for (const organizationId of ["gonzales", "ascension"] as const) {
      const id = `${organizationId}\0${seasonYear}`;
      if (seen.has(id)) continue;
      seen.add(id);
      targets.push({ organizationId, seasonYear });
    }
  }
  return targets;
}

export function normalizeHistoryMapping(
  programNames: readonly string[],
  mapping: readonly HistoryMappingEntry[],
): NormalizedHistoryMappingEntry[] {
  const incoming = new Map<string, HistoryMappingEntry>();
  for (const entry of mapping) {
    const name = String(entry?.programName ?? "").trim();
    if (!name) {
      throw new RegistrationHistoryError("Mapping entries need a program name.");
    }
    if (incoming.has(name)) {
      throw new RegistrationHistoryError(`Program "${name}" is mapped more than once.`);
    }
    incoming.set(name, entry);
  }
  const fileNames = new Set(programNames);
  for (const name of incoming.keys()) {
    if (!fileNames.has(name)) {
      throw new RegistrationHistoryError(
        `Program "${name}" is not in this file. Run a new dry-run.`,
      );
    }
  }

  const normalized: NormalizedHistoryMappingEntry[] = [];
  for (const programName of programNames) {
    const entry = incoming.get(programName);
    const fallLocked = isFallProgramName(programName);
    if (fallLocked) {
      if (entry?.action === "map") {
        throw new RegistrationHistoryError(
          `Fall program "${programName}" can't be mapped in registration history import.`,
        );
      }
      if (entry?.action === "split") {
        throw new RegistrationHistoryError(
          `Fall program "${programName}" can't be split. Fall stays on the roster importer.`,
        );
      }
      normalized.push({ programName, action: "skip" });
      continue;
    }
    if (entry?.action === "split") {
      if (!isSpringProgramName(programName)) {
        throw new RegistrationHistoryError(
          `Split by division league is only for a Spring program. "${programName}" is not a Spring program.`,
        );
      }
      const seasonYear = Number(entry.seasonYear);
      if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
        throw new RegistrationHistoryError(`Program "${programName}" needs a season year.`);
      }
      normalized.push({
        programName,
        action: "split",
        seasonYear,
        divisionOverrides: normalizeDivisionOverrides(programName, entry.divisionOverrides),
      });
      continue;
    }
    if (!entry || entry.action === "skip") {
      normalized.push({ programName, action: "skip" });
      continue;
    }
    if (entry.action !== "map") {
      throw new RegistrationHistoryError(`Program "${programName}" has an invalid action.`);
    }
    const organizationId = String(entry.organizationId || "");
    const seasonYear = Number(entry.seasonYear);
    if (!HISTORY_ORG_SET.has(organizationId)) {
      throw new RegistrationHistoryError(
        `Program "${programName}" must map to gonzales, ascension, or fallball.`,
      );
    }
    if (!Number.isInteger(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
      throw new RegistrationHistoryError(`Program "${programName}" needs a season year.`);
    }
    normalized.push({
      programName,
      action: "map",
      organizationId: organizationId as HistoryOrgId,
      seasonYear,
    });
  }
  const splitCount = normalized.filter((entry) => entry.action === "split").length;
  const mapCount = normalized.filter((entry) => entry.action === "map").length;
  if (splitCount > 1 || (splitCount === 1 && mapCount > 0)) {
    throw new RegistrationHistoryError(
      "A split import can only include one Spring program. Set every other program to Skip.",
    );
  }
  return normalized;
}

function normalizeDivisionOverrides(
  programName: string,
  raw: HistoryMappingEntry["divisionOverrides"],
): DivisionLeagueOverride[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new RegistrationHistoryError(`Program "${programName}" has invalid division leagues.`);
  }
  const overrides: DivisionLeagueOverride[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      throw new RegistrationHistoryError(`Program "${programName}" has invalid division leagues.`);
    }
    const divisionName = String(item.divisionName ?? "").trim();
    const organizationId = String(item.organizationId ?? "").trim();
    if (!divisionName || !organizationId) continue;
    if (!isSpringSplitOrg(organizationId)) {
      throw new RegistrationHistoryError(
        `Pick Gonzales DYB or Ascension LL for "${divisionName}".`,
      );
    }
    if (seen.has(divisionName)) {
      throw new RegistrationHistoryError(`Division "${divisionName}" is assigned more than once.`);
    }
    seen.add(divisionName);
    overrides.push({ divisionName, organizationId });
  }
  overrides.sort((a, b) => a.divisionName.localeCompare(b.divisionName));
  return overrides;
}

export function readRegistrationHistoryExport(input: {
  buffer: Buffer | Uint8Array;
  fileName: string;
}): { fileName: string; rows: Array<Record<string, unknown>> } {
  const fileName = input.fileName?.trim() || "export.xlsx";
  if (!isAllowedSportsConnectExportName(fileName)) {
    throw new RegistrationHistoryError("Upload a .xlsx or .csv export.");
  }
  let parsed;
  try {
    parsed = parseSportsConnectExportBuffer({
      buffer: input.buffer,
      fileName,
      sampleRows: SPORTS_CONNECT_INGEST_MAX_ROWS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read that export.";
    throw new RegistrationHistoryError(message);
  }
  if (parsed.exceedsMaxRows) {
    throw new RegistrationHistoryError("This export has more than 10,000 rows.");
  }
  const hasProgram = parsed.headers.some((header) => header.trim().toLowerCase() === "program name");
  if (!hasProgram) {
    throw new RegistrationHistoryError("The export needs a Program Name column.");
  }
  return { fileName: parsed.fileName, rows: parsed.rows };
}

export function programNamesInRows(rows: readonly Record<string, unknown>[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = readCell(row, PROGRAM_KEYS) || NO_PROGRAM;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function inventoryRegistrationPrograms(
  rows: readonly Record<string, unknown>[],
): ProgramInventoryEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = readCell(row, PROGRAM_KEYS) || NO_PROGRAM;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([programName, rowCount]) => ({
    programName,
    rowCount,
    suggestion: suggestProgramMapping(programName),
    springSplitEligible: canSplitSpringProgram(programName),
  }));
}

export function classifyRegistrationHistory(input: {
  rows: readonly Record<string, unknown>[];
  mapping: readonly HistoryMappingEntry[];
  existingKeys: readonly ExistingHistoryKey[];
  fileName: string;
  fileSha256: string;
}): {
  preview: HistoryPreview;
  inserts: HistoryEnrollmentInsert[];
  normalizedMapping: NormalizedHistoryMappingEntry[];
  classificationDigest: string;
} {
  const programNames = programNamesInRows(input.rows);
  const normalizedMapping = normalizeHistoryMapping(programNames, input.mapping);
  const mappingByProgram = new Map(
    normalizedMapping.map((entry) => [entry.programName, entry]),
  );
  const taken = new Set(
    input.existingKeys.map(
      (key) => `${key.organizationId}\0${key.seasonYear}\0${key.sportsConnectRowKey}`,
    ),
  );
  const crossOrg = buildCrossOrgIndex(input.existingKeys);

  const programs = new Map<string, ProgramAccumulator>();
  const inserts: HistoryEnrollmentInsert[] = [];
  const classificationRows: HistoryClassificationRow[] = [];
  let birthDates = 0;

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index]!;
    const programName = readCell(row, PROGRAM_KEYS) || NO_PROGRAM;
    const mapping = mappingByProgram.get(programName);
    const divisionRaw = readCell(row, DIVISION_KEYS);
    const divisionName = divisionRaw || "(no division)";
    const program = ensureProgram(programs, programName, mapping);
    const division = ensureDivision(program, divisionName);
    program.rowCount += 1;
    if (parseBirthDate(readCell(row, BIRTH_DATE_KEYS))) birthDates += 1;

    const reason = skipReason(row, mapping);
    if (reason) {
      bumpSkip(program, division, reason);
      continue;
    }
    if (!mapping || (mapping.action !== "map" && mapping.action !== "split")) {
      bumpSkip(program, division, "unmapped_or_fall");
      continue;
    }

    const fullName = playerRegRowFullName(row);
    const birthDate = parseBirthDate(readCell(row, BIRTH_DATE_KEYS));
    if (!birthDate) {
      bumpSkip(program, division, "missing_birth_date");
      continue;
    }
    const orderNo = readCell(row, ORDER_NO_KEYS);
    const sportsConnectRowKey = deriveSportsConnectRowKey(orderNo, fullName, birthDate);

    if (mapping.action === "split") {
      classifySplitRow({
        row,
        mapping,
        program,
        division,
        divisionName,
        divisionRaw,
        programName,
        fullName,
        birthDate,
        orderNo,
        sportsConnectRowKey,
        taken,
        crossOrg,
        inserts,
        index,
        classificationRows,
      });
      continue;
    }

    const takenId = `${mapping.organizationId}\0${mapping.seasonYear}\0${sportsConnectRowKey}`;
    if (taken.has(takenId)) {
      classificationRows.push({
        index,
        sportsConnectRowKey,
        organizationId: mapping.organizationId,
        disposition: "same_league",
      });
      program.totals.alreadyPresent += 1;
      division.alreadyPresent += 1;
      continue;
    }
    classificationRows.push({
      index,
      sportsConnectRowKey,
      organizationId: mapping.organizationId,
      disposition: "add",
    });
    taken.add(takenId);
    inserts.push(
      enrollmentInsertFromRow({
        row,
        organizationId: mapping.organizationId,
        seasonYear: mapping.seasonYear,
        sportsConnectRowKey,
        programName,
        divisionRaw,
        fullName,
        birthDate,
        orderNo,
      }),
    );
    program.totals.wouldAdd += 1;
    division.wouldAdd += 1;
  }

  const previewPrograms = [...programs.values()].map(finishProgram);
  const totals = {
    wouldAdd: previewPrograms.reduce((sum, program) => sum + program.totals.wouldAdd, 0),
    alreadyPresent: previewPrograms.reduce(
      (sum, program) => sum + program.totals.alreadyPresent,
      0,
    ),
    skipped: emptySkipCounts(),
    unplaceable: previewPrograms.reduce((sum, program) => sum + program.totals.unplaceable, 0),
    alreadySameLeague: previewPrograms.reduce(
      (sum, program) => sum + program.totals.alreadySameLeague,
      0,
    ),
    alreadyOtherLeague: previewPrograms.reduce(
      (sum, program) => sum + program.totals.alreadyOtherLeague,
      0,
    ),
  };
  for (const program of previewPrograms) {
    for (const reason of SKIP_REASONS) {
      totals.skipped[reason] += program.totals.skipped[reason];
    }
  }
  const leagues = mergeLeagueTotals(previewPrograms);
  const unplaceable = unplaceableDivisions(previewPrograms);
  const splitUsed = previewPrograms.some((program) => program.disposition === "split");

  const preview: HistoryPreview = {
    fileName: input.fileName,
    fileSha256: input.fileSha256,
    totalRows: input.rows.length,
    birthDateCoveragePercent: coveragePercent(birthDates, input.rows.length),
    totals,
    programs: previewPrograms,
    leagues,
    unplaceable,
    mapping: normalizedMapping,
    keyNote: splitUsed ? SPLIT_KEY_NOTE : KEY_NOTE,
  };
  return {
    preview,
    inserts,
    normalizedMapping,
    classificationDigest: registrationClassificationDigest({
      normalizedMapping,
      rows: classificationRows,
    }),
  };
}

export type HistoryRowDisposition = "add" | "same_league" | "other_league" | "unplaceable";

export type HistoryClassificationRow = {
  index: number;
  sportsConnectRowKey: string;
  organizationId: HistoryOrgId | null;
  disposition: HistoryRowDisposition;
};

/** Hash of the exact per-row placement. Row keys stay out of the preview payload. */
export function registrationClassificationDigest(input: {
  normalizedMapping: readonly NormalizedHistoryMappingEntry[];
  rows: readonly HistoryClassificationRow[];
}): string {
  const overrides = input.normalizedMapping
    .filter((entry): entry is Extract<NormalizedHistoryMappingEntry, { action: "split" }> => entry.action === "split")
    .map((entry) => ({
      programName: entry.programName,
      seasonYear: entry.seasonYear,
      divisionOverrides: entry.divisionOverrides,
    }));
  const payload = {
    overrides,
    rows: input.rows.map((row) => ({
      index: row.index,
      sportsConnectRowKey: row.sportsConnectRowKey,
      organizationId: row.organizationId,
      disposition: row.disposition,
    })),
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

const FORBIDDEN_PREVIEW_KEYS = new Set([
  "fullname",
  "firstname",
  "lastname",
  "email",
  "phone",
  "birthdate",
  "dob",
  "streetaddress",
  "guardianemail",
  "guardianphone",
  "rawrow",
  "contactphone",
]);

export function previewContainsRowPii(preview: unknown, needles: readonly string[]): string | null {
  const forbidden = findForbiddenKey(preview);
  if (forbidden) return forbidden;
  const json = JSON.stringify(preview) ?? "";
  for (const needle of needles) {
    if (needle && json.includes(needle)) return needle;
  }
  return null;
}

function findForbiddenKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PREVIEW_KEYS.has(key.toLowerCase())) return key;
    const found = findForbiddenKey(child);
    if (found) return found;
  }
  return null;
}

type DivisionAccumulator = HistoryDivisionCounts;

type LeagueAccumulator = HistoryLeagueTotals;

type ProgramAccumulator = {
  programName: string;
  rowCount: number;
  fallLocked: boolean;
  disposition: "skip" | "map" | "split";
  organizationId: HistoryOrgId | null;
  seasonYear: number | null;
  divisions: Map<string, DivisionAccumulator>;
  leagues: Map<SpringSplitOrg, LeagueAccumulator>;
  totals: HistoryProgramCounts["totals"];
};

function emptyProgramTotals(): HistoryProgramCounts["totals"] {
  return {
    wouldAdd: 0,
    alreadyPresent: 0,
    skipped: emptySkipCounts(),
    unplaceable: 0,
    alreadySameLeague: 0,
    alreadyOtherLeague: 0,
  };
}

function ensureProgram(
  programs: Map<string, ProgramAccumulator>,
  programName: string,
  mapping: NormalizedHistoryMappingEntry | undefined,
): ProgramAccumulator {
  const existing = programs.get(programName);
  if (existing) return existing;
  const split = mapping?.action === "split";
  const seasonYear = mapping?.action === "map" || mapping?.action === "split" ? mapping.seasonYear : null;
  const leagues = new Map<SpringSplitOrg, LeagueAccumulator>();
  if (split && seasonYear != null) {
    for (const organizationId of ["ascension", "gonzales"] as const) {
      leagues.set(organizationId, emptyLeague(organizationId, seasonYear));
    }
  }
  const created: ProgramAccumulator = {
    programName,
    rowCount: 0,
    fallLocked: isFallProgramName(programName),
    disposition: mapping?.action === "map" || mapping?.action === "split" ? mapping.action : "skip",
    organizationId: mapping?.action === "map" ? mapping.organizationId : null,
    seasonYear,
    divisions: new Map(),
    leagues,
    totals: emptyProgramTotals(),
  };
  programs.set(programName, created);
  return created;
}

function emptyLeague(organizationId: SpringSplitOrg, seasonYear: number): LeagueAccumulator {
  return {
    organizationId,
    seasonYear,
    wouldAdd: 0,
    alreadySameLeague: 0,
    alreadyOtherLeague: 0,
    amountCents: 0,
    amountPaidCents: 0,
    balanceCents: 0,
  };
}

function ensureDivision(program: ProgramAccumulator, divisionName: string): DivisionAccumulator {
  const existing = program.divisions.get(divisionName);
  if (existing) return existing;
  const created: DivisionAccumulator = {
    divisionName,
    wouldAdd: 0,
    alreadyPresent: 0,
    skipped: emptySkipCounts(),
    ...(program.disposition === "split"
      ? {
          organizationId: null,
          alreadySameLeague: 0,
          alreadyOtherLeague: 0,
          unplaceable: 0,
          placement: undefined,
          unplaceableReason: null,
        }
      : {}),
  };
  program.divisions.set(divisionName, created);
  return created;
}

function bumpSkip(
  program: ProgramAccumulator,
  division: DivisionAccumulator,
  reason: HistorySkipReason,
) {
  program.totals.skipped[reason] += 1;
  division.skipped[reason] += 1;
}

function finishProgram(program: ProgramAccumulator): HistoryProgramCounts {
  return {
    programName: program.programName,
    rowCount: program.rowCount,
    fallLocked: program.fallLocked,
    disposition: program.disposition,
    organizationId: program.organizationId,
    seasonYear: program.seasonYear,
    divisions: [...program.divisions.values()],
    leagues: [...program.leagues.values()].sort((a, b) =>
      a.organizationId.localeCompare(b.organizationId),
    ),
    totals: program.totals,
  };
}

function skipReason(
  row: Record<string, unknown>,
  mapping: NormalizedHistoryMappingEntry | undefined,
): HistorySkipReason | null {
  const fullName = playerRegRowFullName(row);
  if (!fullName) return "unparseable";
  if (!isCompletedPaymentStatus(readCell(row, PAYMENT_KEYS))) return "not_completed";
  if (
    !mapping ||
    (mapping.action !== "map" && mapping.action !== "split") ||
    isFallProgramName(mapping.programName)
  ) {
    return "unmapped_or_fall";
  }
  if (shouldSkipDivisionImport(readCell(row, DIVISION_KEYS))) return "umpire";
  if (!parseBirthDate(readCell(row, BIRTH_DATE_KEYS))) return "missing_birth_date";
  return null;
}

type CrossOrgIndex = Map<string, Set<string>>;

function seasonRowId(seasonYear: number, sportsConnectRowKey: string): string {
  return `${seasonYear}\0${sportsConnectRowKey}`;
}

function buildCrossOrgIndex(existingKeys: readonly ExistingHistoryKey[]): CrossOrgIndex {
  const index: CrossOrgIndex = new Map();
  for (const key of existingKeys) {
    if (!isSpringSplitOrg(key.organizationId)) continue;
    const id = seasonRowId(key.seasonYear, key.sportsConnectRowKey);
    const orgs = index.get(id) ?? new Set<string>();
    orgs.add(key.organizationId);
    index.set(id, orgs);
  }
  return index;
}

function crossOrgHit(
  index: CrossOrgIndex,
  seasonYear: number,
  sportsConnectRowKey: string,
  targetOrg: SpringSplitOrg,
): "same" | "other" | null {
  const orgs = index.get(seasonRowId(seasonYear, sportsConnectRowKey));
  if (!orgs || orgs.size === 0) return null;
  if (orgs.has(targetOrg)) return "same";
  return "other";
}

function claimCrossOrg(
  index: CrossOrgIndex,
  seasonYear: number,
  sportsConnectRowKey: string,
  targetOrg: SpringSplitOrg,
) {
  const id = seasonRowId(seasonYear, sportsConnectRowKey);
  const orgs = index.get(id) ?? new Set<string>();
  orgs.add(targetOrg);
  index.set(id, orgs);
}

function classifySplitRow(input: {
  row: Record<string, unknown>;
  mapping: Extract<NormalizedHistoryMappingEntry, { action: "split" }>;
  program: ProgramAccumulator;
  division: DivisionAccumulator;
  divisionName: string;
  divisionRaw: string;
  programName: string;
  fullName: string;
  birthDate: Date;
  orderNo: string;
  sportsConnectRowKey: string;
  taken: Set<string>;
  crossOrg: CrossOrgIndex;
  inserts: HistoryEnrollmentInsert[];
  index: number;
  classificationRows: HistoryClassificationRow[];
}) {
  const override = input.mapping.divisionOverrides.find(
    (entry) => entry.divisionName === input.divisionName,
  );
  const placement = placeDivision(input.divisionName, override?.organizationId ?? null);
  if (placement.status === "unplaceable") {
    input.classificationRows.push({
      index: input.index,
      sportsConnectRowKey: input.sportsConnectRowKey,
      organizationId: null,
      disposition: "unplaceable",
    });
    input.division.unplaceable = (input.division.unplaceable ?? 0) + 1;
    input.division.placement = "unplaceable";
    input.division.unplaceableReason = placement.reason;
    input.division.organizationId = null;
    input.program.totals.unplaceable += 1;
    return;
  }

  input.division.organizationId = placement.organizationId;
  input.division.placement = placement.via;
  input.division.unplaceableReason = null;
  const league = input.program.leagues.get(placement.organizationId);
  const hit = crossOrgHit(
    input.crossOrg,
    input.mapping.seasonYear,
    input.sportsConnectRowKey,
    placement.organizationId,
  );
  if (hit === "same" || hit === "other") {
    input.classificationRows.push({
      index: input.index,
      sportsConnectRowKey: input.sportsConnectRowKey,
      organizationId: placement.organizationId,
      disposition: hit === "same" ? "same_league" : "other_league",
    });
    input.program.totals.alreadyPresent += 1;
    input.division.alreadyPresent += 1;
    if (hit === "same") {
      input.program.totals.alreadySameLeague += 1;
      input.division.alreadySameLeague = (input.division.alreadySameLeague ?? 0) + 1;
      if (league) league.alreadySameLeague += 1;
    } else {
      input.program.totals.alreadyOtherLeague += 1;
      input.division.alreadyOtherLeague = (input.division.alreadyOtherLeague ?? 0) + 1;
      if (league) league.alreadyOtherLeague += 1;
    }
    return;
  }

  claimCrossOrg(
    input.crossOrg,
    input.mapping.seasonYear,
    input.sportsConnectRowKey,
    placement.organizationId,
  );
  input.taken.add(
    `${placement.organizationId}\0${input.mapping.seasonYear}\0${input.sportsConnectRowKey}`,
  );
  input.classificationRows.push({
    index: input.index,
    sportsConnectRowKey: input.sportsConnectRowKey,
    organizationId: placement.organizationId,
    disposition: "add",
  });
  const insert = enrollmentInsertFromRow({
    row: input.row,
    organizationId: placement.organizationId,
    seasonYear: input.mapping.seasonYear,
    sportsConnectRowKey: input.sportsConnectRowKey,
    programName: input.programName,
    divisionRaw: input.divisionRaw,
    fullName: input.fullName,
    birthDate: input.birthDate,
    orderNo: input.orderNo,
  });
  input.inserts.push(insert);
  input.program.totals.wouldAdd += 1;
  input.division.wouldAdd += 1;
  if (league) {
    league.wouldAdd += 1;
    league.amountCents += insert.amountCents ?? 0;
    league.amountPaidCents += insert.amountPaidCents ?? 0;
    league.balanceCents += insert.balanceCents ?? 0;
  }
}

function enrollmentInsertFromRow(input: {
  row: Record<string, unknown>;
  organizationId: HistoryOrgId;
  seasonYear: number;
  sportsConnectRowKey: string;
  programName: string;
  divisionRaw: string;
  fullName: string;
  birthDate: Date;
  orderNo: string;
}): HistoryEnrollmentInsert {
  const explicitFirst = readCell(input.row, FIRST_NAME_KEYS);
  const explicitLast = readCell(input.row, LAST_NAME_KEYS);
  const split = splitName(input.fullName);
  return {
    organizationId: input.organizationId,
    seasonYear: input.seasonYear,
    sportsConnectRowKey: input.sportsConnectRowKey,
    programName: input.programName,
    divisionNameRaw: input.divisionRaw || null,
    ageGroup: input.divisionRaw || "Unassigned",
    teamNameRaw: readCell(input.row, TEAM_KEYS) || null,
    teamId: null,
    firstName: explicitFirst || split.firstName,
    lastName: explicitLast || split.lastName,
    fullName: input.fullName,
    gender: readCell(input.row, GENDER_KEYS) || null,
    birthDate: input.birthDate,
    guardianFirstName: readCell(input.row, GUARDIAN_FIRST_KEYS) || null,
    guardianLastName: readCell(input.row, GUARDIAN_LAST_KEYS) || null,
    guardianEmail: readCell(input.row, EMAIL_KEYS) || null,
    guardianPhone: readCell(input.row, GUARDIAN_PHONE_KEYS) || null,
    contactPhone: readCell(input.row, CONTACT_PHONE_KEYS) || null,
    streetAddress: readCell(input.row, STREET_KEYS) || null,
    unit: readCell(input.row, UNIT_KEYS) || null,
    city: readCell(input.row, CITY_KEYS) || null,
    state: readCell(input.row, STATE_KEYS) || null,
    postalCode: readCell(input.row, POSTAL_KEYS) || null,
    sportsConnectOrderNo: input.orderNo || null,
    orderDate: parseOrderDate(readCell(input.row, ORDER_DATE_KEYS)),
    orderDetailDescription: readCell(input.row, ORDER_DETAIL_KEYS) || null,
    orderPaymentStatus: readCell(input.row, PAYMENT_KEYS).trim(),
    amountCents: parseMoneyToCents(readCell(input.row, AMOUNT_KEYS)),
    amountPaidCents: parseMoneyToCents(readCell(input.row, AMOUNT_PAID_KEYS)),
    balanceCents: parseMoneyToCents(readCell(input.row, BALANCE_KEYS)),
    sportsConnectPlayerId: readCell(input.row, PLAYER_ID_KEYS) || null,
    rawRow: minimizeRawRow(input.row),
  };
}

function mergeLeagueTotals(programs: readonly HistoryProgramCounts[]): HistoryLeagueTotals[] {
  const merged = new Map<string, HistoryLeagueTotals>();
  for (const program of programs) {
    for (const league of program.leagues) {
      const id = `${league.organizationId}\0${league.seasonYear}`;
      const current = merged.get(id) ?? emptyLeague(league.organizationId, league.seasonYear);
      current.wouldAdd += league.wouldAdd;
      current.alreadySameLeague += league.alreadySameLeague;
      current.alreadyOtherLeague += league.alreadyOtherLeague;
      current.amountCents += league.amountCents;
      current.amountPaidCents += league.amountPaidCents;
      current.balanceCents += league.balanceCents;
      merged.set(id, current);
    }
  }
  return [...merged.values()].sort(
    (a, b) => a.organizationId.localeCompare(b.organizationId) || a.seasonYear - b.seasonYear,
  );
}

function unplaceableDivisions(programs: readonly HistoryProgramCounts[]): UnplaceableDivision[] {
  const found: UnplaceableDivision[] = [];
  for (const program of programs) {
    for (const division of program.divisions) {
      if (!division.unplaceable || !division.unplaceableReason) continue;
      found.push({
        programName: program.programName,
        divisionName: division.divisionName,
        rowCount: division.unplaceable,
        reason: division.unplaceableReason,
      });
    }
  }
  return found;
}

function coveragePercent(covered: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((covered / total) * 1000) / 10;
}

function readCell(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const parsed = String(value).trim();
    if (parsed) return parsed;
  }
  const lower = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actual = lower.get(key.toLowerCase());
    if (!actual) continue;
    const value = row[actual];
    if (value === undefined || value === null) continue;
    const parsed = String(value).trim();
    if (parsed) return parsed;
  }
  return "";
}

function parseBirthDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const mdy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (mdy) return utcDate(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));
  return null;
}

function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseOrderDate(value: string): Date | null {
  if (!value.trim()) return null;
  return parseBirthDate(value) ?? null;
}

function parseMoneyToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1] ?? null,
  };
}
