// Shared between the survey CRUD API routes and the admin Survey Manager UI
// so the two never drift out of sync on what's a valid question type/season.

export const QUESTION_TYPES = [
  "RATING",
  "LIKERT_CHOICE",
  "MATRIX",
  "SINGLE_CHOICE",
  "TEXT",
  "CONDITIONAL_GATE",
] as const;
export type SurveyQuestionType = (typeof QUESTION_TYPES)[number];

export function isSurveyQuestionType(value: unknown): value is SurveyQuestionType {
  return typeof value === "string" && QUESTION_TYPES.includes(value as SurveyQuestionType);
}

export const SURVEY_SEASONS = ["SPRING", "FALL"] as const;
export type SurveySeasonValue = (typeof SURVEY_SEASONS)[number];

export function isSurveySeason(value: unknown): value is SurveySeasonValue {
  return typeof value === "string" && SURVEY_SEASONS.includes(value as SurveySeasonValue);
}

// "apbaseball" is the cross-org master-only pseudo-org used for the Spring
// survey (Gonzales + Ascension respondents both answer it) — it is
// deliberately not part of siteConfig's ContentOrgId, which only covers real
// per-deployment tenants.
export const SURVEY_ORG_IDS = ["gonzales", "ascension", "fallball", "apbaseball"] as const;
export type SurveyOrgId = (typeof SURVEY_ORG_IDS)[number];

export function isSurveyOrgId(value: unknown): value is SurveyOrgId {
  return typeof value === "string" && SURVEY_ORG_IDS.includes(value as SurveyOrgId);
}

export const SURVEY_ORG_LABELS: Record<SurveyOrgId, string> = {
  gonzales: "Gonzales DYB",
  ascension: "Ascension LL",
  fallball: "Fall Ball",
  apbaseball: "Spring — All Sites (Gonzales + Ascension)",
};

export function surveyOrgLabel(orgId: string | null | undefined): string {
  if (!orgId) return "Unknown org";
  return orgId in SURVEY_ORG_LABELS ? SURVEY_ORG_LABELS[orgId as SurveyOrgId] : orgId;
}

/** Highlight cards on Results when these matrix topics exist. */
export const SURVEY_SNAPSHOT_TOPICS = [
  { label: "Field Conditions", key: "Field conditions" },
  { label: "League Communication", key: "Communication from the league" },
  { label: "Coach Communication", key: "Coach communication" },
  { label: "Umpire Professionalism", key: "Professionalism" },
] as const;
