"use client";

import { useEffect, useState } from "react";

interface SurveyAnalyticsProps {
  organizationId?: string;
}

type SurveySeason = "SPRING" | "FALL";

type SurveyListItem = {
  id: string;
  title: string;
  slug: string;
  season: SurveySeason;
  seasonYear: number;
  organizationId: string;
  _count: { responses: number };
};

type MatrixScore = { sum: number; count: number; avg: number };

type SurveyAnalyticsResponse = {
  totalResponses: number;
  matrixScores: Record<string, MatrixScore>;
  priorityCounts: Record<string, number>;
  availableOrganizations: string[];
  availableDivisions: string[];
};

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export default function SurveyAnalyticsCard({
  organizationId = "fallball",
}: SurveyAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState<SurveySeason>("FALL");
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<SurveyAnalyticsResponse | null>(null);
  const [respondentOrgFilter, setRespondentOrgFilter] = useState<string>("");
  const [divisionFilter, setDivisionFilter] = useState<string>("");

  useEffect(() => {
    async function loadSurveys() {
      setLoading(true);
      try {
        // Spring is a cross-org survey owned by "apbaseball" (master-admin
        // only) — Fall stays scoped to whichever org this card was mounted
        // for, matching the admin's normal tenant scope.
        const listOrg = season === "SPRING" ? "apbaseball" : organizationId;
        const res = await fetch(`/api/admin/surveys?org=${encodeURIComponent(listOrg)}`);
        const data = await safeJson(res);
        const list = Array.isArray(data.surveys) ? (data.surveys as SurveyListItem[]) : [];
        setSurveys(list);
        setSelectedSurveyId(list[0]?.id ?? null);
        setRespondentOrgFilter("");
        setDivisionFilter("");
      } catch (err) {
        console.error("Error loading surveys:", err);
        setSurveys([]);
        setSelectedSurveyId(null);
      } finally {
        setLoading(false);
      }
    }
    loadSurveys();
  }, [organizationId, season]);

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

  const selectedSurvey = surveys.find((s) => s.id === selectedSurveyId);
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
            Season feedback ratings & priority breakdowns
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-400">
          {totalResponses} Parent Responses
        </div>
      </div>

      {/* Season / Org / Division Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Season</span>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value as SurveySeason)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-slate-200"
          >
            <option value="SPRING">2026 Spring</option>
            <option value="FALL">2026 Fall</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Organization</span>
          <select
            value={respondentOrgFilter}
            onChange={(e) => setRespondentOrgFilter(e.target.value)}
            disabled={season === "FALL"}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-slate-200 disabled:opacity-50"
          >
            <option value="">All Organizations</option>
            {season === "SPRING" ? (
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

      {surveys.length === 0 ? (
        <div className="text-slate-400 text-sm py-6 text-center">
          No {season === "SPRING" ? "Spring" : "Fall"} survey found
          {season === "SPRING" ? " (master admin access required)" : ` for org: ${organizationId}`}.
        </div>
      ) : (
        <>
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
    </div>
  );
}
