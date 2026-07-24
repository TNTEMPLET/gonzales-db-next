import type { TripFieldType, TripPrefillSource } from "@/lib/trip/types";

export const SW_REGIONAL_TEMPLATE_KEY = "sw-regional-v1";

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
};

/**
 * Southwest Regional / multi-org travel intake field map.
 * sheetColumn values match the Google Sheet header row exactly
 * (Sheet id 1g4gKH_m_SVip4wI3uBzeZwIt6PVMmIu72qmj80xH7R0).
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
  },
  {
    key: "last_name",
    label: "Player last name",
    sheetColumn: "Last Name",
    fieldType: "text",
    required: true,
    sortOrder: 20,
    prefillFrom: "playerLastName",
  },
  {
    key: "participant_type",
    label: "Participant type",
    sheetColumn: "Participant Type",
    fieldType: "select",
    required: true,
    options: ["Player", "Coach", "Manager", "Other"],
    sortOrder: 30,
    helpText: "Usually Player for All-Star roster athletes.",
  },
  {
    key: "guardian1_email",
    label: "Responsible user / legal guardian email",
    sheetColumn: "Responsible User/Legal Guardian Email Address",
    fieldType: "email",
    required: true,
    sortOrder: 40,
  },
  {
    key: "guardian1_first_name",
    label: "Responsible user / legal guardian first name",
    sheetColumn: "Responsible User/Legal Guardian First Name",
    fieldType: "text",
    required: true,
    sortOrder: 50,
  },
  {
    key: "guardian1_last_name",
    label: "Responsible user / legal guardian last name",
    sheetColumn: "Responsible User/Legal Guardian Last Name",
    fieldType: "text",
    required: true,
    sortOrder: 60,
  },
  {
    key: "guardian2_email",
    label: "2nd responsible user / legal guardian email",
    sheetColumn: "2nd Responsible User/Legal Guardian Email Address",
    fieldType: "email",
    sortOrder: 70,
    helpText: "Optional — second parent/guardian if applicable.",
  },
  {
    key: "guardian2_first_name",
    label: "2nd responsible user / legal guardian first name",
    sheetColumn: "2nd Responsible User/Legal Guardian First Name",
    fieldType: "text",
    sortOrder: 80,
  },
  {
    key: "guardian2_last_name",
    label: "2nd responsible user / legal guardian last name",
    sheetColumn: "2nd Responsible User/Legal Guardian Last Name",
    fieldType: "text",
    sortOrder: 90,
  },
  {
    key: "uniform_number",
    label: "Uniform number",
    sheetColumn: "Uniform Number",
    fieldType: "text",
    sortOrder: 100,
    prefillFrom: "jerseyNumber",
  },
  {
    key: "positions",
    label: "Position(s)",
    sheetColumn: "Position(s)",
    fieldType: "text",
    sortOrder: 110,
    helpText: "e.g. P, C, SS — list all that apply.",
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
  },
  {
    key: "throws",
    label: "Throws",
    sheetColumn: "Throws (R/L)",
    fieldType: "select",
    required: true,
    options: ["R", "L"],
    sortOrder: 130,
  },
];
