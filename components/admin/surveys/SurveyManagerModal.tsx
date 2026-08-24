"use client";

import { useEffect, useState } from "react";
import { SURVEY_ORG_IDS, type SurveyOrgId, type SurveyQuestionType } from "@/lib/surveys/constants";

const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  RATING: "Rating (1-5 scale)",
  LIKERT_CHOICE: "Likert Choice",
  MATRIX: "Matrix (multiple topics, one scale)",
  SINGLE_CHOICE: "Single Choice",
  TEXT: "Open Text",
  CONDITIONAL_GATE: "Yes/No Gate",
};

const ORG_OPTION_LABELS: Record<SurveyOrgId, string> = {
  fallball: "Fall Ball",
  apbaseball: "Spring — All Sites (Gonzales + Ascension)",
  gonzales: "Gonzales DYB only",
  ascension: "Ascension LL only",
};
const ORG_OPTIONS: { value: SurveyOrgId; label: string }[] = SURVEY_ORG_IDS.map((value) => ({
  value,
  label: ORG_OPTION_LABELS[value],
}));

type EditableQuestion = {
  id?: string;
  questionText: string;
  type: SurveyQuestionType;
  isRequired: boolean;
  matrixTopics: string;
  options: string;
  hasAnswers: boolean;
};

type EditableSection = {
  id?: string;
  title: string;
  description: string;
  questions: EditableQuestion[];
  hasAnsweredQuestions: boolean;
};

function blankQuestion(): EditableQuestion {
  return { questionText: "", type: "TEXT", isRequired: true, matrixTopics: "", options: "", hasAnswers: false };
}

function blankSection(): EditableSection {
  return { title: "", description: "", questions: [], hasAnsweredQuestions: false };
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

type ApiQuestion = {
  id: string;
  questionText: string;
  type: string;
  isRequired: boolean;
  matrixTopics: string[];
  options: string[];
  _count: { answers: number };
};

type ApiSection = {
  id: string;
  title: string;
  description: string | null;
  questions: ApiQuestion[];
};

type ApiSurvey = {
  id: string;
  title: string;
  description: string | null;
  season: "SPRING" | "FALL";
  seasonYear: number;
  slug: string;
  organizationId: string;
  isPublished: boolean;
  isAnonymous: boolean;
  sections: ApiSection[];
};

type SurveyManagerModalProps = {
  open: boolean;
  surveyId: string | null;
  isMasterAdmin: boolean;
  onClose: () => void;
  onSaved: (surveyId: string) => void;
};

export default function SurveyManagerModal({
  open,
  surveyId,
  isMasterAdmin,
  onClose,
  onSaved,
}: SurveyManagerModalProps) {
  const isEditing = Boolean(surveyId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [season, setSeason] = useState<"SPRING" | "FALL">("FALL");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [slug, setSlug] = useState("");
  const [organizationId, setOrganizationId] = useState<string>("fallball");
  const [isPublished, setIsPublished] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [sections, setSections] = useState<EditableSection[]>([]);

  useEffect(() => {
    if (!open) return;

    async function resetForNew() {
      setError(null);
      setTitle("");
      setDescription("");
      setSeason("FALL");
      setSeasonYear(new Date().getFullYear());
      setSlug("");
      setOrganizationId("fallball");
      setIsPublished(false);
      setIsAnonymous(true);
      setSections([]);
    }

    async function loadExisting(id: string) {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/surveys/${id}`);
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Failed to load survey");
        }
        const survey = data.survey as ApiSurvey;
        setTitle(survey.title);
        setDescription(survey.description ?? "");
        setSeason(survey.season);
        setSeasonYear(survey.seasonYear);
        setSlug(survey.slug);
        setOrganizationId(survey.organizationId);
        setIsPublished(survey.isPublished);
        setIsAnonymous(survey.isAnonymous);
        setSections(
          survey.sections.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description ?? "",
            hasAnsweredQuestions: s.questions.some((q) => q._count.answers > 0),
            questions: s.questions.map((q) => ({
              id: q.id,
              questionText: q.questionText,
              type: q.type as SurveyQuestionType,
              isRequired: q.isRequired,
              matrixTopics: q.matrixTopics.join(", "),
              options: q.options.join(", "),
              hasAnswers: q._count.answers > 0,
            })),
          })),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load survey");
      } finally {
        setLoading(false);
      }
    }

    if (surveyId) {
      loadExisting(surveyId);
    } else {
      resetForNew();
    }
  }, [open, surveyId]);

  if (!open) return null;

  function updateSection(index: number, patch: Partial<EditableSection>) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function updateQuestion(sectionIndex: number, questionIndex: number, patch: Partial<EditableQuestion>) {
    setSections((prev) =>
      prev.map((s, i) =>
        i !== sectionIndex
          ? s
          : { ...s, questions: s.questions.map((q, j) => (j === questionIndex ? { ...q, ...patch } : q)) },
      ),
    );
  }

  function addSection() {
    setSections((prev) => [...prev, blankSection()]);
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  function addQuestion(sectionIndex: number) {
    setSections((prev) =>
      prev.map((s, i) => (i === sectionIndex ? { ...s, questions: [...s.questions, blankQuestion()] } : s)),
    );
  }

  function removeQuestion(sectionIndex: number, questionIndex: number) {
    setSections((prev) =>
      prev.map((s, i) =>
        i === sectionIndex ? { ...s, questions: s.questions.filter((_, j) => j !== questionIndex) } : s,
      ),
    );
  }

  function moveSectionUp(index: number) {
    if (index <= 0) return;
    setSections((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  }

  function moveSectionDown(index: number) {
    setSections((prev) => {
      if (index >= prev.length - 1) return prev;
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  }

  function moveQuestionUp(sectionIndex: number, questionIndex: number) {
    if (questionIndex <= 0) return;
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sectionIndex) return s;
        const qCopy = [...s.questions];
        const temp = qCopy[questionIndex - 1];
        qCopy[questionIndex - 1] = qCopy[questionIndex];
        qCopy[questionIndex] = temp;
        return { ...s, questions: qCopy };
      }),
    );
  }

  function moveQuestionDown(sectionIndex: number, questionIndex: number) {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sectionIndex) return s;
        if (questionIndex >= s.questions.length - 1) return s;
        const qCopy = [...s.questions];
        const temp = qCopy[questionIndex + 1];
        qCopy[questionIndex + 1] = qCopy[questionIndex];
        qCopy[questionIndex] = temp;
        return { ...s, questions: qCopy };
      }),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      setError("Title and slug are required.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      season,
      seasonYear,
      slug: slug.trim(),
      isPublished,
      isAnonymous,
      sections: sections.map((s, sIdx) => ({
        id: s.id,
        order: sIdx + 1,
        title: s.title.trim(),
        description: s.description.trim() || null,
        questions: s.questions.map((q, qIdx) => ({
          id: q.id,
          order: qIdx + 1,
          questionText: q.questionText.trim(),
          type: q.type,
          isRequired: q.isRequired,
          matrixTopics: q.matrixTopics
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          options: q.options
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean),
        })),
      })),
    };

    // organizationId only makes sense at creation time — the API rejects
    // changing it on an existing survey (would misattribute historical
    // responses), and non-master admins can't set it at all (server always
    // forces their own tenant regardless of what's sent).
    if (!isEditing && isMasterAdmin) {
      payload.organizationId = organizationId;
    }

    try {
      const res = await fetch(
        isEditing ? `/api/admin/surveys/${surveyId}` : "/api/admin/surveys",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to save survey");
      }
      const saved = data.survey as ApiSurvey;
      onSaved(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save survey");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl my-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl text-white space-y-5">
        <div className="flex items-start justify-between">
          <h3 className="text-xl font-bold tracking-tight">
            {isEditing ? "Edit Survey" : "Create Survey"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-medium text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-zinc-400">Loading survey…</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Season
                </label>
                <select
                  value={season}
                  onChange={(e) => setSeason(e.target.value as "SPRING" | "FALL")}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white"
                >
                  <option value="SPRING">Spring</option>
                  <option value="FALL">Fall</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Season Year
                </label>
                <input
                  type="number"
                  value={seasonYear}
                  onChange={(e) => setSeasonYear(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Slug
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="2026-fall-parent-survey"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-emerald-500 focus:outline-none font-mono"
                  required
                />
              </div>

              {!isEditing && isMasterAdmin && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Organization
                  </label>
                  <select
                    value={organizationId}
                    onChange={(e) => setOrganizationId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white"
                  >
                    {ORG_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={isPublished}
                    onChange={(e) => setIsPublished(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-950"
                  />
                  Published (visible on the public survey link)
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-950"
                  />
                  Anonymous responses
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-zinc-200">Sections & Questions</h4>
                <button
                  type="button"
                  onClick={addSection}
                  className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                >
                  + Add Section
                </button>
              </div>

              {sections.map((section, sectionIndex) => (
                <div key={section.id ?? `new-${sectionIndex}`} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1.5 rounded-md">
                      #{sectionIndex + 1}
                    </span>
                    <input
                      type="text"
                      value={section.title}
                      onChange={(e) => updateSection(sectionIndex, { title: e.target.value })}
                      placeholder="Section title"
                      className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      required
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveSectionUp(sectionIndex)}
                        disabled={sectionIndex === 0}
                        title="Move section up"
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSectionDown(sectionIndex)}
                        disabled={sectionIndex === sections.length - 1}
                        title="Move section down"
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSection(sectionIndex)}
                      disabled={section.hasAnsweredQuestions}
                      title={
                        section.hasAnsweredQuestions
                          ? "Cannot remove — contains questions with submitted responses"
                          : "Remove section"
                      }
                      className="rounded-lg border border-red-500/30 px-2.5 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    type="text"
                    value={section.description}
                    onChange={(e) => updateSection(sectionIndex, { description: e.target.value })}
                    placeholder="Section description (optional)"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-300 focus:border-emerald-500 focus:outline-none"
                  />

                  <div className="space-y-2">
                    {section.questions.map((q, questionIndex) => (
                      <div key={q.id ?? `new-${questionIndex}`} className="rounded-lg border border-zinc-800 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-zinc-500">
                            Q{questionIndex + 1}
                          </span>
                          <input
                            type="text"
                            value={q.questionText}
                            onChange={(e) => updateQuestion(sectionIndex, questionIndex, { questionText: e.target.value })}
                            placeholder="Question text"
                            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                            required
                          />
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveQuestionUp(sectionIndex, questionIndex)}
                              disabled={questionIndex === 0}
                              title="Move question up"
                              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => moveQuestionDown(sectionIndex, questionIndex)}
                              disabled={questionIndex === section.questions.length - 1}
                              title="Move question down"
                              className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              ▼
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeQuestion(sectionIndex, questionIndex)}
                            disabled={q.hasAnswers}
                            title={q.hasAnswers ? "Cannot remove — has submitted responses" : "Remove question"}
                            className="rounded-lg border border-red-500/30 px-2.5 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={q.type}
                            onChange={(e) =>
                              updateQuestion(sectionIndex, questionIndex, {
                                type: e.target.value as SurveyQuestionType,
                              })
                            }
                            className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-xs text-white"
                          >
                            {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <input
                              type="checkbox"
                              checked={q.isRequired}
                              onChange={(e) => updateQuestion(sectionIndex, questionIndex, { isRequired: e.target.checked })}
                              className="rounded border-zinc-700 bg-zinc-950"
                            />
                            Required
                          </label>
                        </div>
                        {q.type === "MATRIX" && (
                          <input
                            type="text"
                            value={q.matrixTopics}
                            onChange={(e) => updateQuestion(sectionIndex, questionIndex, { matrixTopics: e.target.value })}
                            placeholder="Matrix topics, comma-separated (e.g. Field conditions, Restrooms)"
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-300 focus:border-emerald-500 focus:outline-none"
                          />
                        )}
                        {q.type !== "TEXT" && (
                          <input
                            type="text"
                            value={q.options}
                            onChange={(e) => updateQuestion(sectionIndex, questionIndex, { options: e.target.value })}
                            placeholder="Options, comma-separated (e.g. 1 Poor, 2 Fair, 3 Good, 4 Very Good, 5 Excellent)"
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-xs text-zinc-300 focus:border-emerald-500 focus:outline-none"
                          />
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addQuestion(sectionIndex)}
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                    >
                      + Add Question
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 sticky bottom-0 bg-zinc-900 pb-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Survey"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
