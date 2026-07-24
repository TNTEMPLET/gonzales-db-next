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
};

export type TripAnswers = Record<string, string | boolean | number | null>;
