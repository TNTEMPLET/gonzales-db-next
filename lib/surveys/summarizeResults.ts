import { toCsvDocument } from "@/lib/export/csv";
import { SURVEY_SNAPSHOT_TOPICS } from "@/lib/surveys/constants";

export type ResultAnswer = {
  id?: string;
  questionId: string;
  matrixTopic: string | null;
  textValue: string | null;
  numberValue: number | null;
  stringValue: string | null;
};

export type ResultResponse = {
  id: string;
  organizationId: string | null;
  divisionName: string | null;
  ageGroup: string | null;
  respondentEmail: string | null;
  wantsBoardContact: boolean;
  contactName?: string | null;
  contactPhone: string | null;
  contactPreferredMethod?: string | null;
  contactBestTime?: string | null;
  submittedAt: Date | string;
  answers: ResultAnswer[];
};

export type ResultQuestion = {
  id: string;
  questionText: string;
  type: string;
  options: string[];
  matrixTopics: string[];
  sectionTitle: string;
};

export type DistributionBucket = { label: string; count: number; percent: number };

export type MatrixTopicSummary = {
  topic: string;
  average: number | null;
  count: number;
  distribution: DistributionBucket[];
};

export type TextComment = {
  id: string;
  text: string;
  organizationId: string | null;
  divisionName: string | null;
  submittedAt: string;
};

export type QuestionSummary = {
  questionId: string;
  questionText: string;
  type: string;
  sectionTitle: string;
  average?: number | null;
  count: number;
  distribution?: DistributionBucket[];
  topics?: MatrixTopicSummary[];
  comments?: TextComment[];
};

export type SnapshotCard = {
  label: string;
  key: string;
  average: number | null;
};

export type CompactResponse = {
  id: string;
  submittedAt: string;
  organizationId: string | null;
  divisionName: string | null;
  respondentEmail: string | null;
  wantsBoardContact: boolean;
  contactName: string | null;
  contactPhone: string | null;
  contactPreferredMethod: string | null;
  contactBestTime: string | null;
  answers: { questionId: string; questionText: string; display: string }[];
};

export type ContactRequestSummary = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  preferredMethod: string | null;
  bestTime: string | null;
  organizationId: string | null;
  divisionName: string | null;
  submittedAt: string;
};

export type SurveyResultsSummary = {
  totalResponses: number;
  questions: QuestionSummary[];
  snapshot: SnapshotCard[];
  responses: CompactResponse[];
  contactRequests: ContactRequestSummary[];
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function roundAvg(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

function ratingBuckets(values: number[]): DistributionBucket[] {
  const total = values.length;
  return [1, 2, 3, 4, 5].map((n) => {
    const count = values.filter((v) => v === n).length;
    return { label: String(n), count, percent: percent(count, total) };
  });
}

function choiceBuckets(values: string[], options: string[]): DistributionBucket[] {
  const total = values.length;
  const labels = options.length > 0 ? options : Array.from(new Set(values));
  const extra = values.filter((v) => !labels.includes(v));
  const all = extra.length ? [...labels, ...Array.from(new Set(extra))] : labels;
  return all.map((label) => {
    const count = values.filter((v) => v === label).length;
    return { label, count, percent: percent(count, total) };
  });
}

function displayAnswer(question: ResultQuestion, answer: ResultAnswer): string | null {
  if (question.type === "MATRIX") {
    const topic = answer.matrixTopic ?? "";
    const score = answer.numberValue ?? answer.stringValue;
    if (!topic && score == null) return null;
    return topic ? `${topic}: ${score ?? "—"}` : String(score ?? "");
  }
  if (question.type === "TEXT") {
    const text = answer.textValue?.trim();
    return text || null;
  }
  if (answer.stringValue?.trim()) return answer.stringValue.trim();
  if (answer.numberValue != null) return String(answer.numberValue);
  return null;
}

function summarizeQuestion(question: ResultQuestion, responses: ResultResponse[]): QuestionSummary {
  const answers = responses.flatMap((r) => r.answers.filter((a) => a.questionId === question.id));
  const base = {
    questionId: question.id,
    questionText: question.questionText,
    type: question.type,
    sectionTitle: question.sectionTitle,
    count: 0,
  };

  if (question.type === "MATRIX") {
    const topics = (question.matrixTopics.length
      ? question.matrixTopics
      : Array.from(new Set(answers.map((a) => a.matrixTopic).filter((t): t is string => Boolean(t))))
    ).map((topic) => {
      const topicAnswers = answers.filter((a) => a.matrixTopic === topic && a.numberValue != null);
      const values = topicAnswers.map((a) => a.numberValue as number);
      return {
        topic,
        average: roundAvg(
          values.reduce((s, v) => s + v, 0),
          values.length,
        ),
        count: values.length,
        distribution: ratingBuckets(values),
      };
    });
    return { ...base, count: topics.reduce((s, t) => s + t.count, 0), topics };
  }

  if (question.type === "RATING" || question.type === "LIKERT_CHOICE") {
    const values = answers.map((a) => a.numberValue).filter((v): v is number => v != null);
    return {
      ...base,
      count: values.length,
      average: roundAvg(
        values.reduce((s, v) => s + v, 0),
        values.length,
      ),
      distribution: ratingBuckets(values),
    };
  }

  if (question.type === "SINGLE_CHOICE" || question.type === "CONDITIONAL_GATE") {
    const values = answers.map((a) => a.stringValue).filter((v): v is string => Boolean(v?.trim()));
    return {
      ...base,
      count: values.length,
      distribution: choiceBuckets(values, question.options),
    };
  }

  if (question.type === "TEXT") {
    const comments: TextComment[] = [];
    for (const response of responses) {
      for (const answer of response.answers) {
        if (answer.questionId !== question.id) continue;
        const text = answer.textValue?.trim();
        if (!text) continue;
        comments.push({
          id: answer.id ?? `${response.id}:${question.id}`,
          text,
          organizationId: response.organizationId,
          divisionName: response.divisionName,
          submittedAt: toIso(response.submittedAt),
        });
      }
    }
    return { ...base, count: comments.length, comments };
  }

  return base;
}

function buildSnapshot(questions: QuestionSummary[]): SnapshotCard[] {
  const matrixTopics = new Map<string, number | null>();
  for (const q of questions) {
    for (const topic of q.topics ?? []) {
      matrixTopics.set(topic.topic, topic.average);
    }
  }

  const known = SURVEY_SNAPSHOT_TOPICS.filter((item) => matrixTopics.has(item.key)).map((item) => ({
    label: item.label,
    key: item.key,
    average: matrixTopics.get(item.key) ?? null,
  }));
  if (known.length > 0) return known;

  const fallback: SnapshotCard[] = [];
  for (const q of questions) {
    if (fallback.length >= 4) break;
    if (q.topics?.length) {
      for (const topic of q.topics) {
        if (fallback.length >= 4) break;
        fallback.push({ label: topic.topic, key: topic.topic, average: topic.average });
      }
      continue;
    }
    if (q.average != null) {
      fallback.push({ label: q.questionText, key: q.questionId, average: q.average });
    }
  }
  return fallback;
}

export function summarizeSurveyResults(input: {
  questions: ResultQuestion[];
  responses: ResultResponse[];
}): SurveyResultsSummary {
  const { questions, responses } = input;
  const questionSummaries = questions.map((q) => summarizeQuestion(q, responses));
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const compact: CompactResponse[] = responses.map((response) => {
    const grouped = new Map<string, string[]>();
    for (const answer of response.answers) {
      const question = questionById.get(answer.questionId);
      if (!question) continue;
      const display = displayAnswer(question, answer);
      if (!display) continue;
      const existing = grouped.get(question.id) ?? [];
      existing.push(display);
      grouped.set(question.id, existing);
    }
    return {
      id: response.id,
      submittedAt: toIso(response.submittedAt),
      organizationId: response.organizationId,
      divisionName: response.divisionName,
      respondentEmail: response.respondentEmail,
      wantsBoardContact: response.wantsBoardContact,
      contactName: response.contactName ?? null,
      contactPhone: response.contactPhone,
      contactPreferredMethod: response.contactPreferredMethod ?? null,
      contactBestTime: response.contactBestTime ?? null,
      answers: questions
        .filter((q) => grouped.has(q.id))
        .map((q) => ({
          questionId: q.id,
          questionText: q.questionText,
          display: (grouped.get(q.id) ?? []).join("; "),
        })),
    };
  });

  const contactRequests: ContactRequestSummary[] = responses
    .filter((r) => r.wantsBoardContact)
    .map((r) => ({
      id: r.id,
      name: r.contactName ?? null,
      phone: r.contactPhone,
      email: r.respondentEmail,
      preferredMethod: r.contactPreferredMethod ?? null,
      bestTime: r.contactBestTime ?? null,
      organizationId: r.organizationId,
      divisionName: r.divisionName,
      submittedAt: toIso(r.submittedAt),
    }));

  return {
    totalResponses: responses.length,
    questions: questionSummaries,
    snapshot: buildSnapshot(questionSummaries),
    responses: compact,
    contactRequests,
  };
}

export function surveyResultsToCsv(input: {
  questions: ResultQuestion[];
  responses: ResultResponse[];
}): string {
  const { questions, responses } = input;
  const columns: { header: string; questionId: string; matrixTopic?: string }[] = [];
  for (const question of questions) {
    if (question.type === "MATRIX") {
      const topics = question.matrixTopics.length
        ? question.matrixTopics
        : ["(topic)"];
      for (const topic of topics) {
        columns.push({ header: `${question.questionText} — ${topic}`, questionId: question.id, matrixTopic: topic });
      }
    } else {
      columns.push({ header: question.questionText, questionId: question.id });
    }
  }

  const headers = [
    "Submitted",
    "Org",
    "Division",
    "Email",
    "Board contact",
    "Full name",
    "Phone",
    "Preferred method",
    "Best time",
    ...columns.map((c) => c.header),
  ];
  const rows = responses.map((response) => {
    const cells: Array<string | number | boolean | null> = [
      toIso(response.submittedAt),
      response.organizationId,
      response.divisionName,
      response.respondentEmail,
      response.wantsBoardContact ? "yes" : "no",
      response.contactName ?? null,
      response.contactPhone,
      response.contactPreferredMethod ?? null,
      response.contactBestTime ?? null,
    ];
    for (const column of columns) {
      const matches = response.answers.filter((a) => {
        if (a.questionId !== column.questionId) return false;
        if (column.matrixTopic) return a.matrixTopic === column.matrixTopic;
        return true;
      });
      const values = matches.map((a) => a.textValue ?? a.stringValue ?? (a.numberValue != null ? String(a.numberValue) : "")).filter(Boolean);
      cells.push(values.join("; "));
    }
    return cells;
  });
  return toCsvDocument(headers, rows);
}
