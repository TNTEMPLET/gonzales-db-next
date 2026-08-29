"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";

interface Question {
  id: string;
  questionText: string;
  type: string;
  isRequired: boolean;
  matrixTopics: string[];
  options: string[];
}

interface Section {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

type SurveySeason = "SPRING" | "FALL";

/**
 * Which of Q15's real seeded division options are valid for each org —
 * computed from the actual options rather than a hardcoded list, so it
 * can't drift out of sync if the seeded divisions ever change. Gonzales
 * DYB divisions are tagged "DYB"/"DBB" in their real option text; every
 * other option belongs to Ascension LL. Fall Ball sees everything.
 */
function divisionsForOrg(org: string, allOptions: string[]): string[] {
  const isDybOrDbb = (opt: string) => opt.includes("DYB") || opt.includes("DBB");
  if (org === "gonzales") return allOptions.filter(isDybOrDbb);
  if (org === "ascension") return allOptions.filter((opt) => !isDybOrDbb(opt));
  if (org === "fallball") return allOptions;
  return [];
}

interface SurveyData {
  id: string;
  title: string;
  description?: string;
  season: SurveySeason;
  sections: Section[];
}

export default function PublicSurveyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const org = searchParams.get("org") || "fallball";
  // Admin-only draft preview -- see app/api/surveys/[slug]/route.ts. Has no
  // effect unless the request also carries a valid admin session, so this
  // flag alone can't expose an unpublished survey to a random visitor.
  const isPreview = searchParams.get("preview") === "1";
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State: questionId / topic -> answer
  const [answers, setAnswers] = useState<Record<string, { numberValue?: number; stringValue?: string; textValue?: string }>>({});
  const [allStarGate, setAllStarGate] = useState<boolean | null>(null);
  // Division/age-group selection — also used as the value for the "Division
  // played" survey question (Q15) so parents aren't asked the same thing twice.
  const [division, setDivision] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  // Spring surveys serve both Gonzales DYB and Ascension LL — the respondent
  // picks which one. Fall surveys are fallball-only, set automatically once
  // the survey loads.
  const [selectedOrg, setSelectedOrg] = useState<string>("");

  useEffect(() => {
    async function loadSurvey() {
      try {
        const previewQuery = isPreview ? "&preview=1" : "";
        const res = await fetch(`/api/surveys/${resolvedParams.slug}?org=${encodeURIComponent(org)}${previewQuery}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setSurvey(data.survey);
          if (data.survey?.season === "FALL") {
            setSelectedOrg("fallball");
          }
        }
      } catch (err) {
        console.error("Error loading survey:", err);
        setError("Failed to load survey. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadSurvey();
  }, [resolvedParams.slug, org, isPreview]);

  const handleRatingChange = (questionId: string, rating: number, matrixTopic?: string) => {
    const key = matrixTopic ? `${questionId}__${matrixTopic}` : questionId;
    setAnswers((prev) => ({
      ...prev,
      [key]: { numberValue: rating, stringValue: rating.toString() },
    }));
  };

  const handleTextChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { textValue: text, stringValue: text },
    }));
  };

  const handleOptionSelect = (questionId: string, option: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { stringValue: option },
    }));
  };

  // Reuse the real "Division played" question (Q15) and its actual seeded
  // options as the source for the top-of-form division/age-group selector,
  // rather than duplicating a hardcoded list that could drift out of sync.
  const divisionQuestion = survey?.sections
    .flatMap((s) => s.questions)
    .find((q) => q.questionText.toLowerCase().includes("division"));

  // Filtered to whichever of Q15's real options are valid for the selected
  // org — a filter over real data, not a separate list, so a Gonzales/
  // Ascension respondent can never end up submitting a division value Q15
  // doesn't actually have.
  const availableDivisions = selectedOrg
    ? divisionsForOrg(selectedOrg, divisionQuestion?.options ?? [])
    : [];

  const handleDivisionSelect = (value: string) => {
    setDivision(value);
    // Keep Q15's own answer in sync so parents aren't asked the same
    // question twice.
    if (divisionQuestion) {
      handleOptionSelect(divisionQuestion.id, value);
    }
  };

  // Whenever the respondent changes org, the previously-selected division
  // may no longer be valid for the new org — clear it (and Q15's answer)
  // rather than leave a stale, possibly-invalid value in place.
  useEffect(() => {
    function resetDivisionForNewOrg() {
      setDivision("");
      if (divisionQuestion) {
        setAnswers((prev) => {
          const next = { ...prev };
          delete next[divisionQuestion.id];
          return next;
        });
      }
    }
    resetDivisionForNewOrg();
    // divisionQuestion is intentionally excluded — it's a new object
    // reference every render, and including it would re-fire this effect
    // (and wipe the just-made selection) immediately after handleDivisionSelect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Belt-and-suspenders: the submit button is hidden in preview mode, but
    // guard here too so a preview session can never write a real response.
    if (isPreview) return;

    if (survey?.season === "SPRING" && !selectedOrg) {
      setError("Please select your organization (Gonzales DYB or Ascension LL) before submitting.");
      return;
    }

    setSubmitting(true);

    try {
      const formattedAnswers: Array<{
        questionId: string;
        matrixTopic?: string;
        textValue?: string;
        numberValue?: number;
        stringValue?: string;
      }> = [];

      Object.entries(answers).forEach(([key, val]) => {
        if (key.includes("__")) {
          const [qId, topic] = key.split("__");
          formattedAnswers.push({
            questionId: qId,
            matrixTopic: topic,
            numberValue: val.numberValue,
            stringValue: val.stringValue,
          });
        } else {
          formattedAnswers.push({
            questionId: key,
            textValue: val.textValue,
            numberValue: val.numberValue,
            stringValue: val.stringValue,
          });
        }
      });

      const res = await fetch(`/api/surveys/${resolvedParams.slug}?org=${encodeURIComponent(org)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedOrg: selectedOrg || null,
          respondentEmail: email || null,
          divisionName: division || null,
          ageGroup: division || null,
          answers: formattedAnswers,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Submission failed");
      }

      setSubmitted(true);
    } catch (err: unknown) {
      console.error("Submit error:", err);
      setError((err as Error).message || "An error occurred submitting your survey.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="flex items-center space-x-3 text-slate-400">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading 2026 Parent Survey...</span>
        </div>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md text-center">
          <div className="w-12 h-12 text-rose-500 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Survey Unavailable</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 max-w-lg text-center shadow-2xl">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Thank You!</h1>
          <p className="text-slate-300 text-sm mb-6">
            Your feedback for the 2026 season has been submitted successfully. Your input helps us continuously improve youth baseball for all players and families.
          </p>
          <div className="inline-flex items-center px-4 py-2 bg-slate-800 rounded-full text-xs text-slate-400">
            <span>✨ AP Baseball Admin Operations</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        {isPreview && (
          <div className="sticky top-2 z-20 flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-200 shadow-lg">
            <span>🔍 Draft Preview</span>
            <span className="font-normal text-amber-200/80">— not publicly visible, submissions are disabled</span>
          </div>
        )}
        {/* Header Branding Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                2026 Official Feedback
              </span>
              <span className="text-xs text-slate-400">⏱️ Est. 3-5 minutes</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              {survey?.title}
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              {survey?.description}
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm flex items-center space-x-3">
            <span>⚠️ {error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {survey?.season === "SPRING" && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-md">
              <div>
                <h2 className="text-lg font-semibold text-emerald-400">Your Organization</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Which organization is your player registered with?
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: "gonzales", label: "⚾ Gonzales DYB" },
                  { id: "ascension", label: "⚾ Ascension Little League" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedOrg(option.id)}
                    className={`p-4 rounded-xl text-center text-sm font-semibold transition-all border ${
                      selectedOrg === option.id
                        ? "bg-emerald-500/10 border-emerald-500 text-emerald-300"
                        : "bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {divisionQuestion && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-md">
              <div>
                <h2 className="text-lg font-semibold text-emerald-400">Your Player&apos;s Division</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Helps us break feedback down by age group.
                </p>
              </div>
              {survey?.season === "SPRING" && !selectedOrg ? (
                <p className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  Select an organization above first.
                </p>
              ) : (
                <select
                  value={division}
                  onChange={(e) => handleDivisionSelect(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select a division…</option>
                  {availableDivisions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {survey?.sections.map((section) => {
            const isAllStarSection = section.title.includes("All-Star");
            if (isAllStarSection && allStarGate === false) {
              return null; // Skip All-Star section if parent selected "No"
            }

            return (
              <div
                key={section.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-md"
              >
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-lg font-semibold text-emerald-400">
                    {section.title}
                  </h2>
                  {section.description && (
                    <p className="text-xs text-slate-400 mt-1">{section.description}</p>
                  )}
                </div>

                <div className="space-y-6">
                  {section.questions.map((q) => {
                    // Already captured by the top-of-form division selector
                    // above (kept in sync via handleDivisionSelect) — don't
                    // ask the same question twice.
                    if (q.id === divisionQuestion?.id) {
                      return null;
                    }

                    if (q.type === "CONDITIONAL_GATE") {
                      return (
                        <div key={q.id} className="space-y-3">
                          <label className="block text-sm font-medium text-slate-200">
                            {q.questionText}
                          </label>
                          <div className="flex items-center space-x-4">
                            {["Yes", "No"].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => {
                                  const isYes = opt === "Yes";
                                  setAllStarGate(isYes);
                                  handleOptionSelect(q.id, opt);
                                }}
                                className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                                  (opt === "Yes" && allStarGate === true) ||
                                  (opt === "No" && allStarGate === false)
                                    ? "bg-emerald-500 text-slate-950 font-bold shadow-lg"
                                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (q.type === "MATRIX") {
                      return (
                        <div key={q.id} className="space-y-4">
                          <label className="block text-sm font-medium text-slate-200">
                            {q.questionText}
                          </label>
                          <div className="space-y-3">
                            {q.matrixTopics.map((topic) => (
                              <div
                                key={topic}
                                className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 sm:flex sm:items-center sm:justify-between space-y-3 sm:space-y-0"
                              >
                                <span className="text-sm text-slate-300 font-medium">
                                  {topic}
                                </span>
                                <div className="flex items-center space-x-2">
                                  {[1, 2, 3, 4, 5].map((num) => {
                                    const key = `${q.id}__${topic}`;
                                    const selectedNum = answers[key]?.numberValue;
                                    return (
                                      <button
                                        key={num}
                                        type="button"
                                        onClick={() => handleRatingChange(q.id, num, topic)}
                                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center ${
                                          selectedNum === num
                                            ? "bg-amber-400 text-slate-950 font-bold shadow-md scale-105"
                                            : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                        }`}
                                      >
                                        {num}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (q.type === "RATING" || q.type === "LIKERT_CHOICE") {
                      return (
                        <div key={q.id} className="space-y-3">
                          <label className="block text-sm font-medium text-slate-200">
                            {q.questionText}
                          </label>
                          <div className="grid grid-cols-5 gap-2">
                            {[1, 2, 3, 4, 5].map((num, idx) => {
                              const label = q.options[idx] || num.toString();
                              const isSelected = answers[q.id]?.numberValue === num || answers[q.id]?.stringValue === label;
                              return (
                                <button
                                  key={num}
                                  type="button"
                                  onClick={() => handleRatingChange(q.id, num)}
                                  className={`p-3 rounded-xl text-center text-xs sm:text-sm font-medium transition-all ${
                                    isSelected
                                      ? "bg-emerald-500 text-slate-950 font-bold shadow-lg"
                                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                  }`}
                                >
                                  <div className="font-bold mb-0.5">{num}</div>
                                  <div className="text-[10px] opacity-80 truncate">{label.replace(/^\d+\s*/, '')}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    if (q.type === "SINGLE_CHOICE") {
                      return (
                        <div key={q.id} className="space-y-3">
                          <label className="block text-sm font-medium text-slate-200">
                            {q.questionText}
                          </label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {q.options.map((opt) => {
                              const isSelected = answers[q.id]?.stringValue === opt;
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => handleOptionSelect(q.id, opt)}
                                  className={`p-3 rounded-xl text-left text-xs sm:text-sm font-medium transition-all border ${
                                    isSelected
                                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-300 font-bold"
                                      : "bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-800"
                                  }`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }

                    if (q.type === "TEXT") {
                      return (
                        <div key={q.id} className="space-y-2">
                          <label className="block text-sm font-medium text-slate-200">
                            {q.questionText}
                          </label>
                          <textarea
                            rows={3}
                            value={answers[q.id]?.textValue || ""}
                            onChange={(e) => handleTextChange(q.id, e.target.value)}
                            placeholder="Share your thoughts..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              </div>
            );
          })}

          {/* Contact & Division Info */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Optional Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Your Email (Optional / Confidential)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="parent@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-4">
            {isPreview ? (
              <div className="w-full rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 py-4 px-6 text-center text-sm font-semibold text-amber-300">
                Submission disabled in draft preview
              </div>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-4 px-6 rounded-2xl shadow-xl hover:shadow-emerald-500/20 transition-all flex items-center justify-center space-x-2 text-base disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Submitting Feedback...</span>
                  </>
                ) : (
                  <>
                    <span>Submit 2026 Parent Survey</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
