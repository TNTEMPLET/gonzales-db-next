"use client";

import { useEffect, useState } from "react";

import SurveyManagerModal from "@/components/admin/surveys/SurveyManagerModal";

interface SurveyAnalyticsProps {
  organizationId?: string;
  isMasterAdmin?: boolean;
}

type SurveySeason = "SPRING" | "FALL";

type SurveyListItem = {
  id: string;
  title: string;
  slug: string;
  season: SurveySeason;
  seasonYear: number;
  organizationId: string;
  isPublished: boolean;
  _count: { responses: number };
};

type MatrixScore = { sum: number; count: number; avg: number };

type TextComment = {
  id: string;
  text: string;
  organizationId: string | null;
  divisionName: string | null;
  submittedAt: string;
};

type TextResponseGroup = {
  questionId: string;
  questionText: string;
  comments: TextComment[];
};

type SurveyAnalyticsResponse = {
  totalResponses: number;
  matrixScores: Record<string, MatrixScore>;
  priorityCounts: Record<string, number>;
  textResponses: TextResponseGroup[];
  availableOrganizations: string[];
  availableDivisions: string[];
};

const ORG_BADGE_LABELS: Record<string, string> = {
  gonzales: "Gonzales DYB",
  ascension: "Ascension LL",
  fallball: "Fall Ball",
};

function orgBadgeLabel(orgId: string | null): string {
  if (!orgId) return "Unknown Org";
  return ORG_BADGE_LABELS[orgId] ?? orgId;
}

function fmtCommentDate(iso: string): string {
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

export default function SurveyAnalyticsCard({
  organizationId = "fallball",
  isMasterAdmin = false,
}: SurveyAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<SurveyAnalyticsResponse | null>(null);
  const [respondentOrgFilter, setRespondentOrgFilter] = useState<string>("");
  const [divisionFilter, setDivisionFilter] = useState<string>("");
  const [expandedTextQuestionId, setExpandedTextQuestionId] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerSurveyId, setManagerSurveyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Includes unpublished drafts — the Manage Surveys toolbar (Edit/Publish/
  // Delete) needs to see and act on a survey the moment it's created, before
  // anyone publishes it. Reused for both the initial load and after any
  // create/update/delete/publish-toggle so the list and selection stay current.
  async function refreshSurveys(selectId?: string | null) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/surveys?includeUnpublished=true");
      const data = await safeJson(res);
      const list = Array.isArray(data.surveys) ? (data.surveys as SurveyListItem[]) : [];
      setSurveys(list);
      const desired = selectId !== undefined ? selectId : list[0]?.id ?? null;
      setSelectedSurveyId(desired && list.some((s) => s.id === desired) ? desired : list[0]?.id ?? null);
    } catch (err) {
      console.error("Error loading surveys:", err);
      setSurveys([]);
      setSelectedSurveyId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function loadInitialSurveys() {
      refreshSurveys();
    }
    loadInitialSurveys();
  }, []);

  // Changing survey invalidates whatever org/division filter was picked
  // for the previous one.
  useEffect(() => {
    function resetFilters() {
      setRespondentOrgFilter("");
      setDivisionFilter("");
      setExpandedTextQuestionId(null);
    }
    resetFilters();
  }, [selectedSurveyId]);

  useEffect(() => {
    if (!selectedSurveyId) {
      function clearAnalytics() {
        setAnalytics(null);
      }
      clearAnalytics();
      return;
    }

    async function loadAnalytics() {
      try {
        const query = new URLSearchParams();
        if (respondentOrgFilter) query.set("respondentOrg", respondentOrgFilter);
        if (divisionFilter) query.set("division", divisionFilter);
        const res = await fetch(
          `/api/admin/surveys/${selectedSurveyId}/results${query.toString() ? `?${query}` : ""}`,
        );
        const data = await safeJson(res);
        setAnalytics(data as unknown as SurveyAnalyticsResponse);
      } catch (err) {
        console.error("Error loading analytics:", err);
        setAnalytics(null);
      }
    }
    loadAnalytics();
  }, [selectedSurveyId, respondentOrgFilter, divisionFilter]);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-400 flex items-center space-x-3">
        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading Survey Desk Analytics...</span>
      </div>
    );
  }

  const matrixScores = analytics?.matrixScores || {};
  const priorityCounts = analytics?.priorityCounts || {};
  const totalResponses = analytics?.totalResponses || 0;
  const availableDivisions = analytics?.availableDivisions || [];
  const textResponses = analytics?.textResponses || [];

  const selectedSurvey = surveys.find((s) => s.id === selectedSurveyId);

  function openCreateModal() {
    setActionError(null);
    setManagerSurveyId(null);
    setManagerOpen(true);
  }

  function openEditModal() {
    if (!selectedSurveyId) return;
    setActionError(null);
    setManagerSurveyId(selectedSurveyId);
    setManagerOpen(true);
  }

  function handleManagerSaved(savedId: string) {
    setManagerOpen(false);
    refreshSurveys(savedId);
  }

  async function handleTogglePublish() {
    if (!selectedSurvey) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/surveys/${selectedSurvey.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !selectedSurvey.isPublished }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to update survey");
      }
      refreshSurveys(selectedSurvey.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update survey");
    }
  }

  async function handleDelete() {
    if (!selectedSurvey) return;
    if (!window.confirm(`Delete "${selectedSurvey.title}"? This cannot be undone.`)) return;

    setActionError(null);
    try {
      let res = await fetch(`/api/admin/surveys/${selectedSurvey.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      let data = await safeJson(res);

      if (res.status === 409 && typeof data.responseCount === "number") {
        const confirmForce = window.confirm(
          `This survey has ${data.responseCount} submitted response(s). Deleting it permanently destroys those responses too. Continue?`,
        );
        if (!confirmForce) return;
        res = await fetch(`/api/admin/surveys/${selectedSurvey.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        });
        data = await safeJson(res);
      }

      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to delete survey");
      }
      refreshSurveys(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete survey");
    }
  }

  const publicPath = selectedSurvey
    ? `/surveys/${selectedSurvey.slug}?org=${encodeURIComponent(selectedSurvey.organizationId)}`
    : null;
  // Built from the real slug + org rather than a hardcoded domain/slug —
  // this route is deployed on every SITE_ORG, so the current origin always
  // resolves correctly regardless of which org's survey is selected.
  const publicUrl =
    publicPath && typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : publicPath;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">📊</span>
            <h2 className="text-lg font-bold text-white">Parent Survey Analytics</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Feedback ratings & priority breakdowns
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-400">
          {totalResponses} Parent Responses
        </div>
      </div>

      {/* Manage Surveys toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openCreateModal}
          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
        >
          + Create Survey
        </button>
        {selectedSurvey && (
          <>
            <button
              type="button"
              onClick={openEditModal}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Edit Survey
            </button>
            <button
              type="button"
              onClick={handleTogglePublish}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              {selectedSurvey.isPublished ? "Unpublish" : "Publish"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
            >
              Delete Survey
            </button>
          </>
        )}
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-medium text-red-300">
          {actionError}
        </div>
      )}

      {surveys.length === 0 ? (
        <div className="text-slate-400 text-sm py-6 text-center">
          No surveys found{organizationId ? ` for org: ${organizationId}` : ""}.
        </div>
      ) : (
        <>
          {/* Survey / Org / Division Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Select Survey</span>
              <select
                value={selectedSurveyId ?? ""}
                onChange={(e) => setSelectedSurveyId(e.target.value || null)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-slate-200"
              >
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                    {s.isPublished ? "" : " (Draft)"}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Organization</span>
              <select
                value={respondentOrgFilter}
                onChange={(e) => setRespondentOrgFilter(e.target.value)}
                disabled={selectedSurvey?.season !== "SPRING"}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-slate-200 disabled:opacity-50"
              >
                <option value="">All Organizations</option>
                {selectedSurvey?.season === "SPRING" ? (
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
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Division</span>
              <select
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                disabled={availableDivisions.length === 0}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-slate-200 disabled:opacity-50"
              >
                <option value="">All Divisions</option>
                {availableDivisions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Top Level Category Rating Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Field Conditions", key: "Field conditions" },
              { label: "League Communication", key: "Communication from the league" },
              { label: "Coach Communication", key: "Coach communication" },
              { label: "Umpire Professionalism", key: "Professionalism" },
            ].map((item) => {
              const score = matrixScores[item.key]?.avg ?? "N/A";
              return (
                <div key={item.key} className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4">
                  <span className="text-xs text-slate-400 font-medium block mb-1">
                    {item.label}
                  </span>
                  <div className="flex items-baseline space-x-1.5">
                    <span className="text-2xl font-bold text-white">{score}</span>
                    <span className="text-xs text-amber-400">/ 5.0 ⭐</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* #1 Priority Breakdown */}
          {Object.keys(priorityCounts).length > 0 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">
                #1 Priority for Next Season (Parent Votes)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(priorityCounts).map(([priority, count]) => (
                  <div
                    key={priority}
                    className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex justify-between items-center"
                  >
                    <span className="text-xs text-slate-300 font-medium">{priority}</span>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                      {count} votes
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open Text Family Feedback */}
          {textResponses.length > 0 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">
                💬 Open Text Family Feedback
              </h3>
              <div className="space-y-2">
                {textResponses.map((group) => {
                  const isExpanded = expandedTextQuestionId === group.questionId;
                  return (
                    <div key={group.questionId} className="border border-slate-800 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedTextQuestionId(isExpanded ? null : group.questionId)
                        }
                        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-900 text-left hover:bg-slate-800/80 transition-colors"
                      >
                        <span className="text-xs font-medium text-slate-200 pr-3">{group.questionText}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                            {group.comments.length}
                          </span>
                          <span className="text-slate-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="divide-y divide-slate-800/80">
                          {group.comments.length === 0 ? (
                            <div className="px-3.5 py-3 text-xs text-slate-500">
                              No comments for the current filters.
                            </div>
                          ) : (
                            group.comments.map((comment) => (
                              <div key={comment.id} className="px-3.5 py-3 space-y-1.5">
                                <p className="text-sm text-slate-200 leading-relaxed">{comment.text}</p>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                  <span className="font-semibold text-emerald-300/90 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    {orgBadgeLabel(comment.organizationId)}
                                  </span>
                                  {comment.divisionName && (
                                    <span className="font-medium text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">
                                      {comment.divisionName}
                                    </span>
                                  )}
                                  <span>{fmtCommentDate(comment.submittedAt)}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Public Share Link Card */}
          {publicPath ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-emerald-300">
                <span className="font-bold">Public Survey URL:</span>{" "}
                <code className="bg-slate-950 px-2 py-1 rounded text-slate-200">
                  {publicUrl}
                </code>
              </div>
              <a
                href={publicPath}
                target="_blank"
                className="inline-flex items-center justify-center text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 px-3 py-1.5 rounded-lg transition-all"
              >
                View Live Form
              </a>
            </div>
          ) : null}
        </>
      )}

      <SurveyManagerModal
        open={managerOpen}
        surveyId={managerSurveyId}
        isMasterAdmin={isMasterAdmin}
        onClose={() => setManagerOpen(false)}
        onSaved={handleManagerSaved}
      />
    </div>
  );
}
