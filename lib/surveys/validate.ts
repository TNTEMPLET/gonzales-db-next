import { isSurveyQuestionType } from "@/lib/surveys/constants";

export type QuestionInput = {
  id?: string;
  order: number;
  questionText: string;
  type: string;
  isRequired: boolean;
  matrixTopics: string[];
  options: string[];
};

export type SectionInput = {
  id?: string;
  order: number;
  title: string;
  description: string | null;
  questions: QuestionInput[];
};

export type ValidateSectionsResult =
  | { ok: true; sections: SectionInput[] }
  | { ok: false; error: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function validateQuestion(raw: unknown, sectionIndex: number, questionIndex: number): { ok: true; question: QuestionInput } | { ok: false; error: string } {
  const where = `section ${sectionIndex + 1}, question ${questionIndex + 1}`;
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: `Invalid question at ${where}` };
  }
  const q = raw as Record<string, unknown>;

  const questionText = typeof q.questionText === "string" ? q.questionText.trim() : "";
  if (!questionText) {
    return { ok: false, error: `questionText is required at ${where}` };
  }
  if (!isSurveyQuestionType(q.type)) {
    return { ok: false, error: `Invalid question type "${String(q.type)}" at ${where}` };
  }
  const rawOrder = q.order;
  const order =
    typeof rawOrder === "number" && Number.isFinite(rawOrder) ? rawOrder : questionIndex + 1;

  if (q.id !== undefined && typeof q.id !== "string") {
    return { ok: false, error: `Invalid question id at ${where}` };
  }
  if (q.matrixTopics !== undefined && !isStringArray(q.matrixTopics)) {
    return { ok: false, error: `matrixTopics must be an array of strings at ${where}` };
  }
  if (q.options !== undefined && !isStringArray(q.options)) {
    return { ok: false, error: `options must be an array of strings at ${where}` };
  }

  return {
    ok: true,
    question: {
      id: typeof q.id === "string" ? q.id : undefined,
      order,
      questionText,
      type: q.type,
      isRequired: q.isRequired !== false,
      matrixTopics: q.matrixTopics !== undefined ? (q.matrixTopics as string[]) : [],
      options: q.options !== undefined ? (q.options as string[]) : [],
    },
  };
}

export function validateSections(raw: unknown): ValidateSectionsResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "sections must be an array" };
  }

  const sections: SectionInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (typeof s !== "object" || s === null) {
      return { ok: false, error: `Invalid section at index ${i}` };
    }
    const section = s as Record<string, unknown>;

    const title = typeof section.title === "string" ? section.title.trim() : "";
    if (!title) {
      return { ok: false, error: `title is required for section ${i + 1}` };
    }
    const rawSectionOrder = section.order;
    const sectionOrder =
      typeof rawSectionOrder === "number" && Number.isFinite(rawSectionOrder)
        ? rawSectionOrder
        : i + 1;

    if (section.id !== undefined && typeof section.id !== "string") {
      return { ok: false, error: `Invalid section id at index ${i}` };
    }

    const rawQuestions = Array.isArray(section.questions) ? section.questions : [];
    const questions: QuestionInput[] = [];
    for (let j = 0; j < rawQuestions.length; j++) {
      const result = validateQuestion(rawQuestions[j], i, j);
      if (!result.ok) return result;
      questions.push(result.question);
    }

    sections.push({
      id: typeof section.id === "string" ? section.id : undefined,
      order: sectionOrder,
      title,
      description:
        section.description === undefined || section.description === null
          ? null
          : String(section.description).trim() || null,
      questions,
    });
  }

  return { ok: true, sections };
}
