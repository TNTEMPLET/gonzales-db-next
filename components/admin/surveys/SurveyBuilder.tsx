"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import ChipListEditor from "@/components/admin/surveys/ChipListEditor";
import SurveyQuestionCard, {
  visibleSectionQuestions,
  type SurveyAnswerValue,
} from "@/components/surveys/SurveyQuestionCard";
import {
  SURVEY_ORG_IDS,
  SURVEY_ORG_LABELS,
  type SurveyOrgId,
  type SurveyQuestionType,
} from "@/lib/surveys/constants";
import { parentSurveyMeta } from "@/lib/surveys/parentSurveyTemplate";
import {
  DEFAULT_GATE_OPTIONS,
  DEFAULT_RATING_OPTIONS,
  QUESTION_TYPE_HELP,
  QUESTION_TYPE_LABELS,
} from "@/lib/surveys/questionTypeLabels";
import { parentSurveySlug, slugifySurveyTitle } from "@/lib/surveys/slug";

type EditableQuestion = {
  id?: string;
  questionText: string;
  type: SurveyQuestionType;
  isRequired: boolean;
  matrixTopics: string[];
  options: string[];
  hasAnswers: boolean;
};

type EditableSection = {
  id?: string;
  title: string;
  description: string;
  questions: EditableQuestion[];
  hasAnsweredQuestions: boolean;
};

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

export type SurveyBuilderMode = "blank" | "template" | "duplicate" | "edit";

type SurveyBuilderProps = {
  mode: SurveyBuilderMode;
  surveyId: string | null;
  duplicateFromId: string | null;
  isMasterAdmin: boolean;
  defaultOrganizationId: string;
  defaultSeason: "SPRING" | "FALL";
  defaultYear: number;
  onSaved: (surveyId: string) => void;
  onCancel: () => void;
};

function blankQuestion(): EditableQuestion {
  return {
    questionText: "",
    type: "TEXT",
    isRequired: true,
    matrixTopics: [],
    options: [],
    hasAnswers: false,
  };
}

function blankSection(): EditableSection {
  return { title: "", description: "", questions: [], hasAnsweredQuestions: false };
}

function optionsForType(type: SurveyQuestionType, current: string[]): string[] {
  if (type === "RATING" || type === "MATRIX") return current.length ? current : DEFAULT_RATING_OPTIONS;
  if (type === "CONDITIONAL_GATE") return DEFAULT_GATE_OPTIONS;
  if (type === "TEXT") return [];
  return current;
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function sectionsFromApi(sections: ApiSection[]): EditableSection[] {
  return sections.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description ?? "",
    hasAnsweredQuestions: s.questions.some((q) => q._count.answers > 0),
    questions: s.questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      type: q.type as SurveyQuestionType,
      isRequired: q.isRequired,
      matrixTopics: q.matrixTopics,
      options: q.options,
      hasAnswers: q._count.answers > 0,
    })),
  }));
}

function stripIds(sections: EditableSection[]): EditableSection[] {
  return sections.map((s) => ({
    ...s,
    id: undefined,
    hasAnsweredQuestions: false,
    questions: s.questions.map((q) => ({ ...q, id: undefined, hasAnswers: false })),
  }));
}

export default function SurveyBuilder({
  mode,
  surveyId,
  duplicateFromId,
  isMasterAdmin,
  defaultOrganizationId,
  defaultSeason,
  defaultYear,
  onSaved,
  onCancel,
}: SurveyBuilderProps) {
  const isEditing = mode === "edit";

  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [loading, setLoading] = useState(mode === "edit" || mode === "duplicate");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [season, setSeason] = useState<"SPRING" | "FALL">(defaultSeason);
  const [seasonYear, setSeasonYear] = useState(defaultYear);
  const [slug, setSlug] = useState("");
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [sections, setSections] = useState<EditableSection[]>([]);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, SurveyAnswerValue>>({});

  useEffect(() => {
    async function hydrate() {
      setError(null);
      setTab("edit");
      setPreviewAnswers({});

      if (mode === "blank") {
        setTitle("");
        setDescription("");
        setSeason(defaultSeason);
        setSeasonYear(defaultYear);
        setSlug("");
        setOrganizationId(defaultOrganizationId);
        setIsAnonymous(true);
        setSections([]);
        setSlugTouched(false);
        setShowAdvanced(false);
        setLoading(false);
        return;
      }

      if (mode === "template") {
        const meta = parentSurveyMeta(defaultYear, defaultSeason);
        setTitle(meta.title);
        setDescription(meta.description);
        setSeason(defaultSeason);
        setSeasonYear(defaultYear);
        setSlug(parentSurveySlug(defaultYear, defaultSeason));
        setOrganizationId(defaultOrganizationId);
        setIsAnonymous(true);
        setSections(
          meta.sections.map((s) => ({
            title: s.title,
            description: s.description ?? "",
            hasAnsweredQuestions: false,
            questions: s.questions.map((q) => ({
              questionText: q.questionText,
              type: q.type as SurveyQuestionType,
              isRequired: q.isRequired,
              matrixTopics: q.matrixTopics,
              options: q.options,
              hasAnswers: false,
            })),
          })),
        );
        setSlugTouched(true);
        setShowAdvanced(false);
        setLoading(false);
        return;
      }

      const loadId = mode === "edit" ? surveyId : duplicateFromId;
      if (!loadId) {
        setError("No survey selected.");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/admin/surveys/${loadId}`);
        const data = await safeJson(res);
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Failed to load survey");
        }
        const survey = data.survey as ApiSurvey;
        if (mode === "duplicate") {
          setTitle(`Copy of ${survey.title}`);
          setDescription(survey.description ?? "");
          setSeason(survey.season);
          setSeasonYear(survey.seasonYear);
          setSlug(slugifySurveyTitle(`copy-of-${survey.slug}`) || `copy-${survey.slug}`);
          setOrganizationId(isMasterAdmin ? survey.organizationId : defaultOrganizationId);
          setIsAnonymous(survey.isAnonymous);
          setSections(stripIds(sectionsFromApi(survey.sections)));
          setSlugTouched(true);
        } else {
          setTitle(survey.title);
          setDescription(survey.description ?? "");
          setSeason(survey.season);
          setSeasonYear(survey.seasonYear);
          setSlug(survey.slug);
          setOrganizationId(survey.organizationId);
          setIsAnonymous(survey.isAnonymous);
          setSections(sectionsFromApi(survey.sections));
          setSlugTouched(true);
        }
        setShowAdvanced(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load survey");
      } finally {
        setLoading(false);
      }
    }
    hydrate();
  }, [mode, surveyId, duplicateFromId, defaultSeason, defaultYear, defaultOrganizationId, isMasterAdmin]);

  function updateTitle(next: string) {
    setTitle(next);
    if (!slugTouched) {
      setSlug(slugifySurveyTitle(next));
    }
  }

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

  function changeQuestionType(sectionIndex: number, questionIndex: number, type: SurveyQuestionType) {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== sectionIndex) return s;
        return {
          ...s,
          questions: s.questions.map((q, j) =>
            j === questionIndex ? { ...q, type, options: optionsForType(type, q.options) } : q,
          ),
        };
      }),
    );
  }

  function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
    const next = index + direction;
    if (next < 0 || next >= list.length) return list;
    const copy = [...list];
    const tmp = copy[index];
    copy[index] = copy[next];
    copy[next] = tmp;
    return copy;
  }

  const payloadSections = useMemo(
    () =>
      sections.map((s, sIdx) => ({
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
          matrixTopics: q.matrixTopics,
          options: q.options,
        })),
      })),
    [sections],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) {
      setError("Title is required. The public link (slug) is filled in automatically from the title.");
      setShowAdvanced(true);
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
      isAnonymous,
      sections: payloadSections,
    };
    if (!isEditing) {
      payload.isPublished = false;
      if (isMasterAdmin) payload.organizationId = organizationId;
    }

    try {
      const res = await fetch(isEditing ? `/api/admin/surveys/${surveyId}` : "/api/admin/surveys", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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

  if (loading) {
    return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-400">Loading survey…</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">
            {mode === "edit" ? "Edit survey" : mode === "duplicate" ? "Duplicate survey" : mode === "template" ? "Parent Survey template" : "New survey"}
          </h2>
          <p className="text-xs text-zinc-400">
            {isEditing
              ? "Publishing is a separate step on the Surveys list — saving here does not change whether families can see it."
              : "Saved as a draft. Publish from the Surveys list when you are ready for families to see it."}
          </p>
        </div>
        <div className="flex gap-2">
          {(["edit", "preview"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                tab === id
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {id === "edit" ? "Edit" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-medium text-red-300">{error}</div>
      )}

      {tab === "preview" ? (
        <div className="rounded-2xl border border-zinc-800 bg-slate-950 p-4 sm:p-6">
          <SurveyBuilderPreview title={title} description={description} seasonYear={seasonYear} sections={sections} answers={previewAnswers} setAnswers={setPreviewAnswers} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => updateTitle(e.target.value)}
                placeholder="Spring 2027 Parent Survey"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="A short note families see at the top of the form."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">Season</label>
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
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">Year</label>
              <input
                type="number"
                value={seasonYear}
                onChange={(e) => setSeasonYear(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
            {!isEditing && isMasterAdmin && (
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">Organization</label>
                <select
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-white"
                >
                  {SURVEY_ORG_IDS.map((id) => (
                    <option key={id} value={id}>
                      {SURVEY_ORG_LABELS[id]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs font-semibold text-zinc-400 hover:text-white"
          >
            {showAdvanced ? "Hide advanced" : "Advanced (public link, anonymous)"}
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Public link slug
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  placeholder="2027-spring-parent-survey"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-zinc-500">Lowercase letters, numbers, and hyphens. Families open /surveys/{slug || "…"}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-950"
                />
                Anonymous responses (email is still optional on the form)
              </label>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-200">Sections & questions</h3>
              <button
                type="button"
                onClick={() => setSections((prev) => [...prev, blankSection()])}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                + Add section
              </button>
            </div>
            {sections.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
                No questions yet. Add a section, then add questions inside it.
              </p>
            )}
            {sections.map((section, sectionIndex) => (
              <div key={section.id ?? `new-${sectionIndex}`} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-emerald-500/10 px-2 py-1.5 font-mono text-xs font-bold text-emerald-400">
                    #{sectionIndex + 1}
                  </span>
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => updateSection(sectionIndex, { title: e.target.value })}
                    placeholder="Section title (e.g. Facilities)"
                    className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    required
                  />
                  <button type="button" onClick={() => setSections((prev) => move(prev, sectionIndex, -1))} disabled={sectionIndex === 0} className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 disabled:opacity-30">▲</button>
                  <button type="button" onClick={() => setSections((prev) => move(prev, sectionIndex, 1))} disabled={sectionIndex === sections.length - 1} className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 disabled:opacity-30">▼</button>
                  <button
                    type="button"
                    onClick={() => setSections((prev) => prev.filter((_, i) => i !== sectionIndex))}
                    disabled={section.hasAnsweredQuestions}
                    title={section.hasAnsweredQuestions ? "Cannot remove — contains questions with submitted responses" : "Remove section"}
                    className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
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
                    <div key={q.id ?? `new-${questionIndex}`} className="space-y-2 rounded-lg border border-zinc-800 p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-zinc-500">Q{questionIndex + 1}</span>
                        <input
                          type="text"
                          value={q.questionText}
                          onChange={(e) => updateQuestion(sectionIndex, questionIndex, { questionText: e.target.value })}
                          placeholder="Question families will see"
                          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                          required
                        />
                        <button type="button" onClick={() => updateSection(sectionIndex, { questions: move(section.questions, questionIndex, -1) })} disabled={questionIndex === 0} className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 disabled:opacity-30">▲</button>
                        <button type="button" onClick={() => updateSection(sectionIndex, { questions: move(section.questions, questionIndex, 1) })} disabled={questionIndex === section.questions.length - 1} className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 disabled:opacity-30">▼</button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSection(sectionIndex, {
                              questions: section.questions.filter((_, j) => j !== questionIndex),
                            })
                          }
                          disabled={q.hasAnswers}
                          title={q.hasAnswers ? "Cannot remove — has submitted responses" : "Remove question"}
                          className="rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Remove
                        </button>
                      </div>
                      {q.hasAnswers && (
                        <p className="text-[11px] text-amber-300/90">Families have already answered this question, so it cannot be deleted.</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={q.type}
                          onChange={(e) => changeQuestionType(sectionIndex, questionIndex, e.target.value as SurveyQuestionType)}
                          className="rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 text-xs text-white"
                        >
                          {(Object.keys(QUESTION_TYPE_LABELS) as SurveyQuestionType[]).map((value) => (
                            <option key={value} value={value}>
                              {QUESTION_TYPE_LABELS[value]}
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
                      <p className="text-[11px] text-zinc-500">{QUESTION_TYPE_HELP[q.type]}</p>
                      {q.type === "MATRIX" && (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Topics to rate</p>
                          <ChipListEditor
                            values={q.matrixTopics}
                            onChange={(matrixTopics) => updateQuestion(sectionIndex, questionIndex, { matrixTopics })}
                            placeholder="Add a topic, then press Enter"
                          />
                        </div>
                      )}
                      {q.type !== "TEXT" && q.type !== "CONDITIONAL_GATE" && (
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                            {q.type === "MATRIX" || q.type === "RATING" ? "Scale labels" : "Choices"}
                          </p>
                          <ChipListEditor
                            values={q.options}
                            onChange={(options) => updateQuestion(sectionIndex, questionIndex, { options })}
                            placeholder="Add a choice, then press Enter"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateSection(sectionIndex, { questions: [...section.questions, blankQuestion()] })}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    + Add question
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : isEditing ? "Save changes" : "Save draft"}
        </button>
      </div>
    </form>
  );
}

function SurveyBuilderPreview({
  title,
  description,
  seasonYear,
  sections,
  answers,
  setAnswers,
}: {
  title: string;
  description: string;
  seasonYear: number;
  sections: EditableSection[];
  answers: Record<string, SurveyAnswerValue>;
  setAnswers: Dispatch<SetStateAction<Record<string, SurveyAnswerValue>>>;
}) {
  return (
    <div className="space-y-6 text-slate-100">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
        Live preview — this is what families see. Submissions are not sent from here.
      </div>
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">{seasonYear} Official Feedback</span>
        <h3 className="mt-1 text-xl font-bold text-white">{title || "Untitled survey"}</h3>
        {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      </div>
      {sections.map((section, sIdx) => {
        const questions = visibleSectionQuestions(
          section.questions.map((q, qIdx) => ({
            id: q.id ?? `s${sIdx}-q${qIdx}`,
            questionText: q.questionText,
            type: q.type,
            isRequired: q.isRequired,
            matrixTopics: q.matrixTopics,
            options: q.options,
          })),
          answers,
        );
        if (questions.length === 0) return null;
        return (
          <div key={section.id ?? `s${sIdx}`} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <h4 className="text-sm font-semibold text-emerald-400">{section.title || `Section ${sIdx + 1}`}</h4>
            {questions.map((q) => (
              <SurveyQuestionCard
                key={q.id}
                question={q}
                answers={answers}
                onRating={(questionId, rating, topic) => {
                  const key = topic ? `${questionId}__${topic}` : questionId;
                  setAnswers((prev) => ({ ...prev, [key]: { numberValue: rating, stringValue: String(rating) } }));
                }}
                onText={(questionId, text) => setAnswers((prev) => ({ ...prev, [questionId]: { textValue: text, stringValue: text } }))}
                onOption={(questionId, option) => setAnswers((prev) => ({ ...prev, [questionId]: { stringValue: option } }))}
              />
            ))}
          </div>
        );
      })}
      {sections.length === 0 && <p className="text-sm text-zinc-500">Add a section to preview questions.</p>}
    </div>
  );
}
