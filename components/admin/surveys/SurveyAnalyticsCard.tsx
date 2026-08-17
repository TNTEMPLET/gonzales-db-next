"use client";

import { useEffect, useState } from "react";

interface SurveyAnalyticsProps {
  organizationId?: string;
}

export default function SurveyAnalyticsCard({
  organizationId = "fallball",
}: SurveyAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    async function loadSurveys() {
      try {
        const res = await fetch(`/api/admin/surveys?org=${organizationId}`);
        const data = await res.json();
        if (data.surveys && data.surveys.length > 0) {
          setSurveys(data.surveys);
          setSelectedSurveyId(data.surveys[0].id);
        }
      } catch (err) {
        console.error("Error loading surveys:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSurveys();
  }, [organizationId]);

  useEffect(() => {
    if (!selectedSurveyId) return;

    async function loadAnalytics() {
      try {
        const res = await fetch(`/api/admin/surveys/${selectedSurveyId}/results`);
        const data = await res.json();
        setAnalytics(data);
      } catch (err) {
        console.error("Error loading analytics:", err);
      }
    }
    loadAnalytics();
  }, [selectedSurveyId]);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-400 flex items-center space-x-3">
        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading Survey Desk Analytics...</span>
      </div>
    );
  }

  if (surveys.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-400">
        <p className="text-sm">No active surveys found for org: {organizationId}</p>
      </div>
    );
  }

  const matrixScores = analytics?.matrixScores || {};
  const priorityCounts = analytics?.priorityCounts || {};
  const totalResponses = analytics?.totalResponses || 0;

  const selectedSurvey = surveys.find((s) => s.id === selectedSurveyId);
  const publicPath = selectedSurvey
    ? `/surveys/${selectedSurvey.slug}?org=${encodeURIComponent(organizationId)}`
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
            <h2 className="text-lg font-bold text-white">2026 Parent Survey Analytics</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time season feedback ratings & priority breakdowns
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-400">
            {totalResponses} Parent Responses
          </div>
        </div>
      </div>

      {/* Top Level Category Rating Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Field Conditions", key: "Field conditions" },
          { label: "League Communication", key: "Communication from the league" },
          { label: "Coach Communication", key: "Coach communication" },
          { label: "Umpire Professionalism", key: "Professionalism" },
        ].map((item) => {
          const score = matrixScores[item.key]?.avg || "N/A";
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
                  {count as number} votes
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
    </div>
  );
}
