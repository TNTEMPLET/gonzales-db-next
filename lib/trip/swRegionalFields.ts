import type { TripFieldType, TripPrefillSource } from "@/lib/trip/types";

export const SW_REGIONAL_TEMPLATE_KEY = "sw-regional-v1";

/** Form section for UI grouping */
export type TripFieldSection = "roster" | "health";

export type SeedField = {
  key: string;
  label: string;
  sheetColumn: string;
  fieldType: TripFieldType;
  required?: boolean;
  options?: string[];
  sortOrder: number;
  helpText?: string;
  prefillFrom?: TripPrefillSource;
  adminOnly?: boolean;
  section?: TripFieldSection;
  /**
   * Never include in tournament-director / Google Sheet CSV export.
   * Health + staff-only contact extras.
   */
  excludeFromDirectorExport?: boolean;
};

/** Health / travel-consideration field keys (player sheets only; never director CSV). */
export const TRIP_HEALTH_FIELD_KEYS = [
  "health_allergies",
  "health_sleep",
  "health_anxiety",
  "health_medications",
  "health_other",
] as const;

export type TripHealthFieldKey = (typeof TRIP_HEALTH_FIELD_KEYS)[number];

export function isTripHealthFieldKey(key: string): boolean {
  return (TRIP_HEALTH_FIELD_KEYS as readonly string[]).includes(key);
}

export function tripFieldSection(key: string): TripFieldSection {
  if (isTripHealthFieldKey(key) || key.startsWith("health_")) return "health";
  return "roster";
}

/**
 * Southwest Regional / multi-org travel intake field map.
 * Roster sheetColumn values match the Google Sheet header row exactly
 * (Sheet id 1g4gKH_m_SVip4wI3uBzeZwIt6PVMmIu72qmj80xH7R0).
 * Health fields are parent-facing but excluded from director CSV.
 */
export const SW_REGIONAL_V1_FIELDS: SeedField[] = [
  {
    key: "first_name",
    label: "Player first name",
    sheetColumn: "First Name",
    fieldType: "text",
    required: true,
    sortOrder: 10,
    prefillFrom: "playerFirstName",
    section: "roster",
  },
  {
    key: "last_name",
    label: "Player last name",
    sheetColumn: "Last Name",
    fieldType: "text",
    required: true,
    sortOrder: 20,
    prefillFrom: "playerLastName",
    section: "roster",
  },
  {
    key: "participant_type",
    label: "Participant type",
    sheetColumn: "Participant Type",
    fieldType: "select",
    required: true,
    options: ["Player", "Coach", "Manager", "Other"],
    sortOrder: 30,
    helpText:
      "Players get binder sheets. Coach/Manager/Other appear on the director spreadsheet only.",
    section: "roster",
  },
  {
    key: "guardian1_email",
    label: "Responsible user / legal guardian email",
    sheetColumn: "Responsible User/Legal Guardian Email Address",
    fieldType: "email",
    required: true,
    sortOrder: 40,
    section: "roster",
  },
  {
    key: "guardian1_first_name",
    label: "Responsible user / legal guardian first name",
    sheetColumn: "Responsible User/Legal Guardian First Name",
    fieldType: "text",
    required: true,
    sortOrder: 50,
    section: "roster",
  },
  {
    key: "guardian1_last_name",
    label: "Responsible user / legal guardian last name",
    sheetColumn: "Responsible User/Legal Guardian Last Name",
    fieldType: "text",
    required: true,
    sortOrder: 60,
    section: "roster",
  },
  {
    key: "guardian1_phone",
    label: "Responsible user / legal guardian phone",
    sheetColumn: "",
    fieldType: "phone",
    sortOrder: 65,
    helpText: "Optional — player contact for staff (not on director CSV).",
    section: "roster",
    excludeFromDirectorExport: true,
  },
  {
    key: "guardian2_email",
    label: "2nd responsible user / legal guardian email",
    sheetColumn: "2nd Responsible User/Legal Guardian Email Address",
    fieldType: "email",
    sortOrder: 70,
    helpText: "Optional — second parent/guardian if applicable.",
    section: "roster",
  },
  {
    key: "guardian2_first_name",
    label: "2nd responsible user / legal guardian first name",
    sheetColumn: "2nd Responsible User/Legal Guardian First Name",
    fieldType: "text",
    sortOrder: 80,
    section: "roster",
  },
  {
    key: "guardian2_last_name",
    label: "2nd responsible user / legal guardian last name",
    sheetColumn: "2nd Responsible User/Legal Guardian Last Name",
    fieldType: "text",
    sortOrder: 90,
    section: "roster",
  },
  {
    key: "guardian2_phone",
    label: "2nd responsible user / legal guardian phone",
    sheetColumn: "",
    fieldType: "phone",
    sortOrder: 95,
    helpText: "Optional — player contact for staff (not on director CSV).",
    section: "roster",
    excludeFromDirectorExport: true,
  },
  {
    key: "uniform_number",
    label: "Uniform number",
    sheetColumn: "Uniform Number",
    fieldType: "text",
    sortOrder: 100,
    prefillFrom: "jerseyNumber",
    section: "roster",
  },
  {
    key: "positions",
    label: "Position(s)",
    sheetColumn: "Position(s)",
    fieldType: "text",
    sortOrder: 110,
    helpText: "e.g. P, C, SS — list all that apply.",
    section: "roster",
  },
  {
    key: "bats",
    label: "Bats",
    sheetColumn: "Bats (R/L/S)",
    fieldType: "select",
    required: true,
    options: ["R", "L", "S"],
    sortOrder: 120,
    helpText: "R = right, L = left, S = switch.",
    section: "roster",
  },
  {
    key: "throws",
    label: "Throws",
    sheetColumn: "Throws (R/L)",
    fieldType: "select",
    required: true,
    options: ["R", "L"],
    sortOrder: 130,
    section: "roster",
  },
  // ── Section 3: Health and Allergy (player sheets only; never director CSV) ──
  {
    key: "health_allergies",
    label: "Allergies",
    sheetColumn: "",
    fieldType: "textarea",
    sortOrder: 200,
    helpText: "List any allergies (food, medication, insect, environmental). Write “None” if none.",
    section: "health",
    excludeFromDirectorExport: true,
  },
  {
    key: "health_sleep",
    label: "Sleep concerns or issues",
    sheetColumn: "",
    fieldType: "textarea",
    sortOrder: 210,
    helpText: "Anything coaches should know about sleep during travel.",
    section: "health",
    excludeFromDirectorExport: true,
  },
  {
    key: "health_anxiety",
    label: "Any history of anxiety issues",
    sheetColumn: "",
    fieldType: "textarea",
    sortOrder: 220,
    helpText: "Optional context that helps coaching staff support your player.",
    section: "health",
    excludeFromDirectorExport: true,
  },
  {
    key: "health_medications",
    label: "Daily medications (name of medicine and regimen)",
    sheetColumn: "",
    fieldType: "textarea",
    sortOrder: 230,
    helpText: "Medicine name, dose, and when it is taken. Write “None” if none.",
    section: "health",
    excludeFromDirectorExport: true,
  },
  {
    key: "health_other",
    label: "Any other concerns or issues not covered above",
    sheetColumn: "",
    fieldType: "textarea",
    sortOrder: 240,
    section: "health",
    excludeFromDirectorExport: true,
  },
];

/** Director / Google Sheet header row (roster only). */
export const DIRECTOR_SHEET_HEADERS = SW_REGIONAL_V1_FIELDS.filter(
  (f) => !f.excludeFromDirectorExport && f.sheetColumn.trim() !== "",
).map((f) => f.sheetColumn);
