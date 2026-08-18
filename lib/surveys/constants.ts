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
