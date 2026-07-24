export type TripFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "date"
  | "select"
  | "checkbox"
  | "number"
  | "readonly";

export type TripEventStatus = "draft" | "open" | "closed";
export type TripParticipantStatus = "not_started" | "draft" | "submitted";

export type TripFieldSection = "roster" | "health";

export type TripPrefillSource =
  | "playerFullName"
  | "playerFirstName"
  | "playerLastName"
  | "ageGroup"
  | "team"
  | "jerseyNumber";

export type TripFieldDefPublic = {
  key: string;
  label: string;
  sheetColumn: string;
  fieldType: TripFieldType;
  required: boolean;
  options: string[];
  sortOrder: number;
  helpText: string | null;
  prefillFrom: TripPrefillSource | null;
  adminOnly: boolean;
  section: TripFieldSection;
  /** Never appear on tournament-director CSV */
  excludeFromDirectorExport: boolean;
};

export type TripAnswers = Record<string, string | boolean | number | null>;
