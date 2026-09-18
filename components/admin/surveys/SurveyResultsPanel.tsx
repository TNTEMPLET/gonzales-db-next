"use client";

import { useEffect, useState } from "react";

import { boardContactMethodLabel, boardContactTimeLabel } from "@/lib/surveys/boardContact";
import { surveyOrgLabel } from "@/lib/surveys/constants";
import { surveyPublicPath } from "@/lib/surveys/publicPath";
import type { CompactResponse, QuestionSummary, SnapshotCard } from "@/lib/surveys/summarizeResults";

type SurveyListItem = {
  id: string;
  title: string;
  slug: string;
  season: "SPRING" | "FALL";
  organizationId: string;
  isPublished: boolean;
};

type ResultsPayload = {
  totalResponses: number;
  questions: QuestionSummary[];
  snapshot: SnapshotCard[];
  responses: CompactResponse[];
  contactRequests: { id: string; phone: string | null; email: string | null; organizationId: string | null; divisionName: string | null; submittedAt: string }[];
  availableOrganizations: string[];
  availableDivisions: string[];
};

type SurveyResultsPanelProps = {
  survey: SurveyListItem;
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export default function SurveyResultsPanel({ survey }: SurveyResultsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [respondentOrgFilter, setRespondentOrgFilter] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [expandedResponseId, setExpandedResponseId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRespondentOrgFilter("");
    setDivisionFilter("");
    setExpandedQuestionId(null);
    setExpandedResponseId(null);
  }, [survey.id]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams();
        if (respondentOrgFilter) query.set("respondentOrg", respondentOrgFilter);
        if (divisionFilter) query.set("division", divisionFilter);
        const res = await fetch(
          `/api/admin/surveys/${survey.id}/results${query.toString() ? `?${query}` : ""}`,
        );
        const json = await safeJson(res);
        if (!res.ok) {
          throw new Error(typeof json.error === "string" ? json.error : "Failed to load results");
        }
        setData(json as unknown as ResultsPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [survey.id, respondentOrgFilter, divisionFilter]);

  const publicPath = surveyPublicPath(survey.slug, survey.organizationId, survey.isPublished);
  const csvHref = `/api/admin/surveys/${survey.id}/results?format=csv${
    respondentOrgFilter ? `&respondentOrg=${encodeURIComponent(respondentOrgFilter)}` : ""
  }${divisionFilter ? `&division=${encodeURIComponent(divisionFilter)}` : ""}`;

  async function copyLink() {
    const url = `${window.location.origin}${publicPath}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-zinc-400">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        Loading results…
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>;
  }

  const total = data?.totalResponses ?? 0;
  const snapshot = data?.snapshot ?? [];
  const questions = data?.questions ?? [];
  const responses = data?.responses ?? [];
  const availableDivisions = data?.availableDivisions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{survey.title}</h2>
          <p className="text-xs text-zinc-400">{total} response{total === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            {copied ? "Copied" : "Copy public link"}
          </button>
          <a
            href={publicPath}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            {survey.isPublished ? "Open live form" : "Preview draft"}
          </a>
          {total > 0 && (
            <a
              href={csvHref}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Export CSV
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Organization</span>
          <select
            value={respondentOrgFilter}
            onChange={(e) => setRespondentOrgFilter(e.target.value)}
            disabled={survey.season !== "SPRING"}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-200 disabled:opacity-50"
          >
            <option value="">All organizations</option>
            {survey.season === "SPRING" ? (
              <>
                <option value="gonzales">Gonzales DYB</option>
                <option value="ascension">Ascension LL</option>
              </>
            ) : (
              <option value="fallball">Fall Ball</option>
            )}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Division</span>
          <select
            value={divisionFilter}
            onChange={(e) => setDivisionFilter(e.target.value)}
            disabled={availableDivisions.length === 0}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-200 disabled:opacity-50"
          >
            <option value="">All divisions</option>
            {availableDivisions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-zinc-200">No responses yet</p>
          <p className="mt-1 text-xs text-zinc-500">Copy the public link and share it with families. Results will show up here.</p>
        </div>
      ) : (
        <>
          {snapshot.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {snapshot.map((card) => (
                <div key={card.key} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
                  <span className="mb-1 block text-xs font-medium text-zinc-400">{card.label}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-white">{card.average ?? "—"}</span>
                    {card.average != null && <span className="text-xs text-amber-400">/ 5.0</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {questions.map((question) => (
              <QuestionResultCard
                key={question.questionId}
                question={question}
                expanded={expandedQuestionId === question.questionId}
                onToggle={() =>
                  setExpandedQuestionId(expandedQuestionId === question.questionId ? null : question.questionId)
                }
              />
            ))}
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-200">Individual responses</div>
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="border-b border-zinc-800 text-[11px] uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Org / Division</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3 text-right">Answers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {responses.map((row) => {
                  const open = expandedResponseId === row.id;
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="px-4 py-3 text-zinc-400">{fmtDate(row.submittedAt)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-300/90">
                          {surveyOrgLabel(row.organizationId)}
                        </span>
                        {row.divisionName && (
                          <span className="ml-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{row.divisionName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.wantsBoardContact ? (
                          <div>
                            <div className="font-semibold text-amber-300">{row.contactName || row.contactPhone || "Asked to be contacted"}</div>
                            {row.contactPhone && <div className="text-[11px] text-zinc-400">{row.contactPhone}</div>}
                            {row.respondentEmail && <div className="text-[11px] text-zinc-500">{row.respondentEmail}</div>}
                            {(row.contactPreferredMethod || row.contactBestTime) && (
                              <div className="text-[11px] text-zinc-500">
                                {boardContactMethodLabel(row.contactPreferredMethod)}
                                {row.contactBestTime ? ` · ${boardContactTimeLabel(row.contactBestTime)}` : ""}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setExpandedResponseId(open ? null : row.id)}
                          className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
                        >
                          {open ? "Hide" : "View"}
                        </button>
                        {open && (
                          <dl className="mt-2 space-y-1.5 text-left">
                            {row.answers.map((a) => (
                              <div key={a.questionId}>
                                <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{a.questionText}</dt>
                                <dd className="text-zinc-200">{a.display}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionResultCard({
  question,
  expanded,
  onToggle,
}: {
  question: QuestionSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-900/80">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">{question.sectionTitle}</p>
          <p className="text-sm font-medium text-zinc-100">{question.questionText}</p>
        </div>
        <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
          {question.count}
        </span>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-zinc-800 px-4 py-3">
          {question.average != null && (
            <p className="text-sm text-zinc-300">
              Average <span className="font-bold text-white">{question.average}</span>
              <span className="text-xs text-amber-400"> / 5.0</span>
            </p>
          )}
          {question.topics?.map((topic) => (
            <div key={topic.topic} className="space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-zinc-200">{topic.topic}</span>
                <span className="text-zinc-400">{topic.average ?? "—"} avg · {topic.count}</span>
              </div>
              <DistributionBars buckets={topic.distribution} />
            </div>
          ))}
          {question.distribution && !question.topics && <DistributionBars buckets={question.distribution} />}
          {question.comments && (
            <div className="divide-y divide-zinc-800/80">
              {question.comments.length === 0 ? (
                <p className="py-2 text-xs text-zinc-500">No comments for the current filters.</p>
              ) : (
                question.comments.map((comment) => (
                  <div key={comment.id} className="space-y-1 py-2.5">
                    <p className="text-sm leading-relaxed text-zinc-200">{comment.text}</p>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-300/90">
                        {surveyOrgLabel(comment.organizationId)}
                      </span>
                      {comment.divisionName && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{comment.divisionName}</span>
                      )}
                      <span>{fmtDate(comment.submittedAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DistributionBars({ buckets }: { buckets: { label: string; count: number; percent: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="space-y-1.5">
      {buckets.map((bucket) => (
        <div key={bucket.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-[11px] text-zinc-400">{bucket.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.max(bucket.count > 0 ? 6 : 0, (bucket.count / max) * 100)}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-[11px] text-zinc-400">
            {bucket.count} · {bucket.percent}%
          </span>
        </div>
      ))}
    </div>
  );
}
