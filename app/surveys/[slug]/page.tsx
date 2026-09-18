"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";

import SurveyQuestionCard, {
  visibleSectionQuestions,
  type SurveyAnswerValue,
} from "@/components/surveys/SurveyQuestionCard";
import BoardContactFields from "@/components/surveys/BoardContactFields";
import { divisionsForOrg, isDivisionQuestion } from "@/lib/surveys/divisions";
import { validateBoardContact, type BoardContactMethod, type BoardContactTime } from "@/lib/surveys/boardContact";

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

interface SurveyData {
  id: string;
  title: string;
  description?: string;
  season: SurveySeason;
  seasonYear?: number;
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
  const isPreview = searchParams.get("preview") === "1";
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, SurveyAnswerValue>>({});
  const [division, setDivision] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [wantsBoardContact, setWantsBoardContact] = useState(false);
  const [contactName, setContactName] = useState<string>("");
  const [contactPhone, setContactPhone] = useState<string>("");
  const [contactPreferredMethod, setContactPreferredMethod] = useState<BoardContactMethod | "">("");
  const [contactBestTime, setContactBestTime] = useState<BoardContactTime | "">("");
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

  const divisionQuestion = survey?.sections
    .flatMap((s) => s.questions)
    .find((q) => isDivisionQuestion(q.questionText));

  const availableDivisions = selectedOrg
    ? divisionsForOrg(selectedOrg, divisionQuestion?.options ?? [])
    : [];

  const handleDivisionSelect = (value: string) => {
    setDivision(value);
    if (divisionQuestion) {
      handleOptionSelect(divisionQuestion.id, value);
    }
  };

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
    // divisionQuestion is a new object each render — including it would wipe a just-made selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isPreview) return;

    if (survey?.season === "SPRING" && !selectedOrg) {
      setError("Please select your organization (Gonzales DYB or Ascension LL) before submitting.");
      return;
    }

    const boardContact = validateBoardContact({
      wantsBoardContact,
      contactName,
      contactPhone,
      email,
      preferredMethod: contactPreferredMethod,
      bestTime: contactBestTime,
    });
    if (!boardContact.ok) {
      setError(boardContact.error);
      return;
    }

    setSubmitting(true);

    try {
      const visibleIds = new Set(
        (survey?.sections ?? []).flatMap((section) =>
          visibleSectionQuestions(section.questions, answers, divisionQuestion?.id).map((q) => q.id),
        ),
      );
      if (divisionQuestion) visibleIds.add(divisionQuestion.id);

      const formattedAnswers: Array<{
        questionId: string;
        matrixTopic?: string;
        textValue?: string;
        numberValue?: number;
        stringValue?: string;
      }> = [];

      Object.entries(answers).forEach(([key, val]) => {
        const questionId = key.includes("__") ? key.split("__")[0] : key;
        if (!visibleIds.has(questionId)) return;
        if (key.includes("__")) {
          const topic = key.slice(questionId.length + 2);
          formattedAnswers.push({
            questionId,
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
          wantsBoardContact,
          contactName: wantsBoardContact ? contactName.trim() : null,
          contactPhone: wantsBoardContact ? contactPhone.trim() : null,
          contactPreferredMethod: wantsBoardContact ? contactPreferredMethod || null : null,
          contactBestTime: wantsBoardContact ? contactBestTime || null : null,
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

  const seasonYear = survey?.seasonYear ?? new Date().getFullYear();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="flex items-center space-x-3 text-slate-400">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading survey...</span>
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
            Your feedback for the {seasonYear} season has been submitted successfully. Your input helps us continuously
            improve youth baseball for all players and families.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        {isPreview && (
          <div className="sticky top-2 z-20 flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-200 shadow-lg">
            <span>Draft Preview</span>
            <span className="font-normal text-amber-200/80">— not publicly visible, submissions are disabled</span>
          </div>
        )}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                {seasonYear} Official Feedback
              </span>
              <span className="text-xs text-slate-400">Est. 3–5 minutes</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">{survey?.title}</h1>
            <p className="text-slate-300 text-sm leading-relaxed">{survey?.description}</p>
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
                <p className="text-xs text-slate-400 mt-1">Which organization is your player registered with?</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: "gonzales", label: "Gonzales DYB" },
                  { id: "ascension", label: "Ascension Little League" },
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
                <p className="text-xs text-slate-400 mt-1">Helps us break feedback down by age group.</p>
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
            const questions = visibleSectionQuestions(section.questions, answers, divisionQuestion?.id);
            if (questions.length === 0) return null;
            return (
              <div key={section.id} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-md">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-lg font-semibold text-emerald-400">{section.title}</h2>
                  {section.description && <p className="text-xs text-slate-400 mt-1">{section.description}</p>}
                </div>
                <div className="space-y-6">
                  {questions.map((q) => (
                    <SurveyQuestionCard
                      key={q.id}
                      question={q}
                      answers={answers}
                      onRating={handleRatingChange}
                      onText={handleTextChange}
                      onOption={handleOptionSelect}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Optional Details</h3>
            {!wantsBoardContact && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Your Email (Optional / Confidential)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="parent@example.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <div className={`${wantsBoardContact ? "" : "pt-2 border-t border-slate-800"} space-y-3`}>
              <label className="flex items-start gap-2.5 text-sm text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantsBoardContact}
                  onChange={(e) => {
                    setWantsBoardContact(e.target.checked);
                    if (!e.target.checked) {
                      setContactName("");
                      setContactPhone("");
                      setContactPreferredMethod("");
                      setContactBestTime("");
                    }
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                />
                <span>Would you like to be contacted by the AP Baseball Board?</span>
              </label>

              {wantsBoardContact && (
                <BoardContactFields
                  contactName={contactName}
                  contactPhone={contactPhone}
                  email={email}
                  preferredMethod={contactPreferredMethod}
                  bestTime={contactBestTime}
                  onName={setContactName}
                  onPhone={setContactPhone}
                  onEmail={setEmail}
                  onMethod={setContactPreferredMethod}
                  onTime={setContactBestTime}
                />
              )}
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
                    <span>Submitting feedback...</span>
                  </>
                ) : (
                  <span>Submit {survey?.title ?? "survey"}</span>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
