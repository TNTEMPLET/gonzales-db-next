import type { SurveyQuestionType } from "@/lib/surveys/constants";

export const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  RATING: "Rating (1–5)",
  LIKERT_CHOICE: "Agree / disagree scale",
  MATRIX: "Rate several items",
  SINGLE_CHOICE: "Pick one",
  TEXT: "Written comment",
  CONDITIONAL_GATE: "Yes / No (show extra questions if Yes)",
};

export const QUESTION_TYPE_HELP: Record<SurveyQuestionType, string> = {
  RATING: "Families tap a number from 1 to 5. Use this for overall scores.",
  LIKERT_CHOICE: "Five labeled choices such as Very Unlikely → Very Likely.",
  MATRIX: "One scale applied to a list of topics (field conditions, restrooms, …).",
  SINGLE_CHOICE: "Families pick exactly one option from your list.",
  TEXT: "An open comment box. Best for “what should we improve?”",
  CONDITIONAL_GATE:
    "Yes/No question. If they pick No, the rest of this section is hidden.",
};

export const DEFAULT_RATING_OPTIONS = [
  "1 Poor",
  "2 Fair",
  "3 Good",
  "4 Very Good",
  "5 Excellent",
];

export const DEFAULT_GATE_OPTIONS = ["Yes", "No"];
