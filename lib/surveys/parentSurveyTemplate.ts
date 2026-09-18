import type { SectionInput } from "@/lib/surveys/validate";
import { parentSurveyTitle } from "@/lib/surveys/slug";

const RATING_SCALE = ["1 Poor", "2 Fair", "3 Good", "4 Very Good", "5 Excellent"];

/**
 * The 15-question seasonal parent survey used as a start-from-template
 * option in Survey Desk. Structure matches the 2026 seed; year/season
 * are filled in by the caller.
 */
export function parentSurveyTemplateSections(): SectionInput[] {
  return [
    {
      order: 1,
      title: "Section 1: Overall Experience",
      description: null,
      questions: [
        {
          order: 1,
          questionText: "1. Overall, how would you rate your family's experience this season?",
          type: "RATING",
          isRequired: true,
          matrixTopics: [],
          options: RATING_SCALE,
        },
        {
          order: 2,
          questionText: "2. How likely are you to register your child again next season?",
          type: "LIKERT_CHOICE",
          isRequired: true,
          matrixTopics: [],
          options: ["Very Unlikely", "Unlikely", "Neutral", "Likely", "Very Likely"],
        },
        {
          order: 3,
          questionText: "3. How likely are you to recommend our organization to another family?",
          type: "RATING",
          isRequired: true,
          matrixTopics: [],
          options: ["1 Not Likely", "2", "3", "4", "5 Very Likely"],
        },
      ],
    },
    {
      order: 2,
      title: "Section 2: Facilities",
      description: null,
      questions: [
        {
          order: 4,
          questionText: "4. Please rate the following facility areas:",
          type: "MATRIX",
          isRequired: true,
          matrixTopics: ["Field conditions", "Restrooms", "Concessions", "Parking", "Overall cleanliness"],
          options: RATING_SCALE,
        },
      ],
    },
    {
      order: 3,
      title: "Section 3: League Operations",
      description: null,
      questions: [
        {
          order: 5,
          questionText: "5. Please rate the following league operations areas:",
          type: "MATRIX",
          isRequired: true,
          matrixTopics: [
            "Registration process",
            "Communication from the league",
            "Scheduling of games",
            "Organization of events",
            "Volunteer support",
          ],
          options: RATING_SCALE,
        },
      ],
    },
    {
      order: 4,
      title: "Section 4: Coaches & Player Development",
      description: null,
      questions: [
        {
          order: 6,
          questionText: "6. Please rate the following coaching and player development areas:",
          type: "MATRIX",
          isRequired: true,
          matrixTopics: [
            "Coach communication",
            "Sportsmanship emphasized by coaches",
            "Player skill development",
            "Positive team environment",
          ],
          options: RATING_SCALE,
        },
      ],
    },
    {
      order: 5,
      title: "Section 5: Umpires",
      description: null,
      questions: [
        {
          order: 7,
          questionText: "7. Please rate the following umpire areas:",
          type: "MATRIX",
          isRequired: true,
          matrixTopics: ["Professionalism", "Knowledge of rules", "Consistency of calls", "Overall umpire performance"],
          options: RATING_SCALE,
        },
      ],
    },
    {
      order: 6,
      title: "Section 6: Open Feedback",
      description: null,
      questions: [
        {
          order: 8,
          questionText: "8. What did the organization do well this season?",
          type: "TEXT",
          isRequired: false,
          matrixTopics: [],
          options: [],
        },
        {
          order: 9,
          questionText: "9. What is the most important thing we should improve next season?",
          type: "TEXT",
          isRequired: false,
          matrixTopics: [],
          options: [],
        },
        {
          order: 10,
          questionText: "10. What should be our #1 priority for improvement next season?",
          type: "SINGLE_CHOICE",
          isRequired: true,
          matrixTopics: [],
          options: [
            "Facilities",
            "Communication",
            "Scheduling",
            "Umpires",
            "Player Development",
            "All-Star Program",
            "Concessions",
            "Other",
          ],
        },
      ],
    },
    {
      order: 7,
      title: "Optional Section: All-Star Program",
      description: "Complete this section only if your player participated in All-Stars after the regular season.",
      questions: [
        {
          order: 11,
          questionText: "11. Did your player participate in All-Stars?",
          type: "CONDITIONAL_GATE",
          isRequired: false,
          matrixTopics: [],
          options: ["Yes", "No"],
        },
        {
          order: 12,
          questionText: "12. Please rate the following All-Star program areas:",
          type: "MATRIX",
          isRequired: false,
          matrixTopics: [
            "Selection process transparency",
            "Communication about All-Stars",
            "Tournament preparation",
            "Coaching staff",
            "Overall All-Star experience",
          ],
          options: RATING_SCALE,
        },
        {
          order: 13,
          questionText: "13. Did your player's All-Star experience meet your expectations?",
          type: "SINGLE_CHOICE",
          isRequired: false,
          matrixTopics: [],
          options: ["Exceeded Expectations", "Met Expectations", "Below Expectations"],
        },
        {
          order: 14,
          questionText: "14. What improvements would you suggest for the All-Star program?",
          type: "TEXT",
          isRequired: false,
          matrixTopics: [],
          options: [],
        },
      ],
    },
    {
      order: 8,
      title: "Optional Information",
      description: null,
      questions: [
        {
          order: 15,
          questionText: "15. Division played:",
          type: "SINGLE_CHOICE",
          isRequired: false,
          matrixTopics: [],
          options: [
            "3-4TB",
            "5UTB",
            "6U Mod TB",
            "6U CP",
            "7/8 Majors",
            "7U CP",
            "8U CP",
            "9/10 Majors",
            "9U DYB",
            "10U DYB",
            "11/12 Majors",
            "12U DYB",
            "13-15 DBB",
            "15-17 DBB",
            "Other",
          ],
        },
      ],
    },
  ];
}

export function parentSurveyDescription(): string {
  return "Brief season feedback form for families • Estimated time: 3-5 minutes. Scale: 1 = Poor, 2 = Fair, 3 = Good, 4 = Very Good, 5 = Excellent.";
}

export function parentSurveyMeta(seasonYear: number, season: "SPRING" | "FALL") {
  return {
    title: parentSurveyTitle(seasonYear, season),
    description: parentSurveyDescription(),
    sections: parentSurveyTemplateSections(),
  };
}
