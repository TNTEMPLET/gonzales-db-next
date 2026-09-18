"use client";

export type SurveyQuestionView = {
  id: string;
  questionText: string;
  type: string;
  isRequired?: boolean;
  matrixTopics: string[];
  options: string[];
};

export type SurveyAnswerValue = {
  numberValue?: number;
  stringValue?: string;
  textValue?: string;
};

type SurveyQuestionCardProps = {
  question: SurveyQuestionView;
  answers: Record<string, SurveyAnswerValue>;
  onRating: (questionId: string, rating: number, matrixTopic?: string) => void;
  onText: (questionId: string, text: string) => void;
  onOption: (questionId: string, option: string) => void;
};

export default function SurveyQuestionCard({
  question: q,
  answers,
  onRating,
  onText,
  onOption,
}: SurveyQuestionCardProps) {
  if (q.type === "CONDITIONAL_GATE") {
    const selected = answers[q.id]?.stringValue;
    const options = q.options.length ? q.options : ["Yes", "No"];
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-200">{q.questionText}</label>
        <div className="flex items-center space-x-4">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onOption(q.id, opt)}
              className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
                selected === opt
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-lg"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">If you choose No, the rest of this section is skipped.</p>
      </div>
    );
  }

  if (q.type === "MATRIX") {
    return (
      <div className="space-y-4">
        <label className="block text-sm font-medium text-slate-200">{q.questionText}</label>
        <div className="space-y-3">
          {q.matrixTopics.map((topic) => {
            const key = `${q.id}__${topic}`;
            const selectedNum = answers[key]?.numberValue;
            return (
              <div
                key={topic}
                className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 sm:flex sm:items-center sm:justify-between space-y-3 sm:space-y-0"
              >
                <span className="text-sm text-slate-300 font-medium">{topic}</span>
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => onRating(q.id, num, topic)}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center ${
                        selectedNum === num
                          ? "bg-amber-400 text-slate-950 font-bold shadow-md scale-105"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (q.type === "RATING" || q.type === "LIKERT_CHOICE") {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-200">{q.questionText}</label>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((num, idx) => {
            const label = q.options[idx] || num.toString();
            const isSelected = answers[q.id]?.numberValue === num || answers[q.id]?.stringValue === label;
            return (
              <button
                key={num}
                type="button"
                onClick={() => onRating(q.id, num)}
                className={`p-3 rounded-xl text-center text-xs sm:text-sm font-medium transition-all ${
                  isSelected
                    ? "bg-emerald-500 text-slate-950 font-bold shadow-lg"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <div className="font-bold mb-0.5">{num}</div>
                <div className="text-[10px] opacity-80 truncate">{label.replace(/^\d+\s*/, "")}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (q.type === "SINGLE_CHOICE") {
    return (
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-200">{q.questionText}</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {q.options.map((opt) => {
            const isSelected = answers[q.id]?.stringValue === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onOption(q.id, opt)}
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
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-200">{q.questionText}</label>
        <textarea
          rows={3}
          value={answers[q.id]?.textValue || ""}
          onChange={(e) => onText(q.id, e.target.value)}
          placeholder="Share your thoughts..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
        />
      </div>
    );
  }

  return null;
}

export function visibleSectionQuestions<T extends { id: string; type: string }>(
  questions: T[],
  answers: Record<string, SurveyAnswerValue>,
  hiddenQuestionId?: string | null,
): T[] {
  const visible: T[] = [];
  let hideRest = false;
  for (const q of questions) {
    if (hiddenQuestionId && q.id === hiddenQuestionId) continue;
    if (hideRest) continue;
    visible.push(q);
    if (q.type === "CONDITIONAL_GATE" && answers[q.id]?.stringValue === "No") {
      hideRest = true;
    }
  }
  return visible;
}
