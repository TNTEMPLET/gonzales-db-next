import { createHash } from "node:crypto";

import { shouldSkipDivisionImport } from "@/lib/admin/teamsImportHelpers";

import { deriveSportsConnectRowKey, playerRegRowFullName } from "./enrollmentRowKey";
import {
  isAllowedSportsConnectExportName,
  parseSportsConnectExportBuffer,
  SPORTS_CONNECT_INGEST_MAX_ROWS,
} from "./parseExportBuffer";
import { PLAYER_REG_HISTORY_REPORT_KIND } from "./registrationHistoryKind";

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

export type HistoryMappingEntry = {
  programName: string;
  action: string;
  organizationId?: string;
  seasonYear?: number;
};

export type NormalizedHistoryMappingEntry =
  | { programName: string; action: "skip" }
  | {
      programName: string;
      action: "map";
      organizationId: HistoryOrgId;
      seasonYear: number;
    };

export type HistorySkipCounts = Record<HistorySkipReason, number>;

export type HistoryDivisionCounts = {
  divisionName: string;
  wouldAdd: number;
  alreadyPresent: number;
  skipped: HistorySkipCounts;
};

export type HistoryProgramCounts = {
  programName: string;
  rowCount: number;
  fallLocked: boolean;
  disposition: "skip" | "map";
  organizationId: HistoryOrgId | null;
  seasonYear: number | null;
  divisions: HistoryDivisionCounts[];
  totals: {
    wouldAdd: number;
    alreadyPresent: number;
    skipped: HistorySkipCounts;
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
  };
  programs: HistoryProgramCounts[];
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
};

const KEY_NOTE =
  "Would-add counts a new organization, season, and order-line key. A repeated key in this file, or a key already stored, counts as already present and is left unchanged.";

export function isFallProgramName(programName: string): boolean {
  return programName.toLowerCase().includes("fall");
}

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
    programs: preview.programs.map((program) => ({
      programName: program.programName,
      disposition: program.disposition,
      organizationId: program.organizationId,
      seasonYear: program.seasonYear,
      divisions: program.divisions,
      totals: program.totals,
    })),
  });
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
      normalized.push({ programName, action: "skip" });
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
  return normalized;
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

  const programs = new Map<string, ProgramAccumulator>();
  const inserts: HistoryEnrollmentInsert[] = [];
  let birthDates = 0;

  for (const row of input.rows) {
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
    if (!mapping || mapping.action !== "map") {
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
    const takenId = `${mapping.organizationId}\0${mapping.seasonYear}\0${sportsConnectRowKey}`;
    if (taken.has(takenId)) {
      program.totals.alreadyPresent += 1;
      division.alreadyPresent += 1;
      continue;
    }
    taken.add(takenId);
    const explicitFirst = readCell(row, FIRST_NAME_KEYS);
    const explicitLast = readCell(row, LAST_NAME_KEYS);
    const split = splitName(fullName);
    inserts.push({
      organizationId: mapping.organizationId,
      seasonYear: mapping.seasonYear,
      sportsConnectRowKey,
      programName,
      divisionNameRaw: divisionRaw || null,
      ageGroup: divisionRaw || "Unassigned",
      teamNameRaw: readCell(row, TEAM_KEYS) || null,
      teamId: null,
      firstName: explicitFirst || split.firstName,
      lastName: explicitLast || split.lastName,
      fullName,
      gender: readCell(row, GENDER_KEYS) || null,
      birthDate,
      guardianFirstName: readCell(row, GUARDIAN_FIRST_KEYS) || null,
      guardianLastName: readCell(row, GUARDIAN_LAST_KEYS) || null,
      guardianEmail: readCell(row, EMAIL_KEYS) || null,
      guardianPhone: readCell(row, GUARDIAN_PHONE_KEYS) || null,
      contactPhone: readCell(row, CONTACT_PHONE_KEYS) || null,
      streetAddress: readCell(row, STREET_KEYS) || null,
      unit: readCell(row, UNIT_KEYS) || null,
      city: readCell(row, CITY_KEYS) || null,
      state: readCell(row, STATE_KEYS) || null,
      postalCode: readCell(row, POSTAL_KEYS) || null,
      sportsConnectOrderNo: orderNo || null,
      orderDate: parseOrderDate(readCell(row, ORDER_DATE_KEYS)),
      orderDetailDescription: readCell(row, ORDER_DETAIL_KEYS) || null,
      orderPaymentStatus: readCell(row, PAYMENT_KEYS).trim(),
      amountCents: parseMoneyToCents(readCell(row, AMOUNT_KEYS)),
      amountPaidCents: parseMoneyToCents(readCell(row, AMOUNT_PAID_KEYS)),
      balanceCents: parseMoneyToCents(readCell(row, BALANCE_KEYS)),
      sportsConnectPlayerId: readCell(row, PLAYER_ID_KEYS) || null,
      rawRow: minimizeRawRow(row),
    });
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
  };
  for (const program of previewPrograms) {
    for (const reason of SKIP_REASONS) {
      totals.skipped[reason] += program.totals.skipped[reason];
    }
  }

  const preview: HistoryPreview = {
    fileName: input.fileName,
    fileSha256: input.fileSha256,
    totalRows: input.rows.length,
    birthDateCoveragePercent: coveragePercent(birthDates, input.rows.length),
    totals,
    programs: previewPrograms,
    mapping: normalizedMapping,
    keyNote: KEY_NOTE,
  };
  return { preview, inserts, normalizedMapping };
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

type ProgramAccumulator = {
  programName: string;
  rowCount: number;
  fallLocked: boolean;
  disposition: "skip" | "map";
  organizationId: HistoryOrgId | null;
  seasonYear: number | null;
  divisions: Map<string, DivisionAccumulator>;
  totals: HistoryProgramCounts["totals"];
};

function ensureProgram(
  programs: Map<string, ProgramAccumulator>,
  programName: string,
  mapping: NormalizedHistoryMappingEntry | undefined,
): ProgramAccumulator {
  const existing = programs.get(programName);
  if (existing) return existing;
  const created: ProgramAccumulator = {
    programName,
    rowCount: 0,
    fallLocked: isFallProgramName(programName),
    disposition: mapping?.action === "map" ? "map" : "skip",
    organizationId: mapping?.action === "map" ? mapping.organizationId : null,
    seasonYear: mapping?.action === "map" ? mapping.seasonYear : null,
    divisions: new Map(),
    totals: { wouldAdd: 0, alreadyPresent: 0, skipped: emptySkipCounts() },
  };
  programs.set(programName, created);
  return created;
}

function ensureDivision(program: ProgramAccumulator, divisionName: string): DivisionAccumulator {
  const existing = program.divisions.get(divisionName);
  if (existing) return existing;
  const created: DivisionAccumulator = {
    divisionName,
    wouldAdd: 0,
    alreadyPresent: 0,
    skipped: emptySkipCounts(),
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
  if (!mapping || mapping.action !== "map" || isFallProgramName(mapping.programName)) {
    return "unmapped_or_fall";
  }
  if (shouldSkipDivisionImport(readCell(row, DIVISION_KEYS))) return "umpire";
  if (!parseBirthDate(readCell(row, BIRTH_DATE_KEYS))) return "missing_birth_date";
  return null;
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
