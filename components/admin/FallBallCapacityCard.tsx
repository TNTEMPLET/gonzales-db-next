"use client";

import { useEffect, useState } from "react";
import type { FallBallCapacityReportResponse } from "@/app/api/admin/sports-connect/capacity/route";

export default function FallBallCapacityCard() {
  const [data, setData] = useState<FallBallCapacityReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sports-connect/capacity");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load capacity data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSendReport = async () => {
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await fetch("/api/cron/fallball-daily-report", {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setEmailStatus("✅ Report sent to apboard@apbaseball.com!");
      } else {
        setEmailStatus(`⚠️ ${json.message || json.error || "Failed to send email."}`);
      }
    } catch (err: any) {
      setEmailStatus(`❌ Error: ${err?.message || "Send failed"}`);
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-6 text-slate-300 shadow-xl backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
          <span className="text-sm font-medium">Loading Fall Ball Division Capacity Data...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/90 p-6 text-slate-100 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
              Live Production
            </span>
            <span className="text-xs text-slate-400">
              Source: {data.sourceFile}
            </span>
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-white">
            📊 Fall Ball 2026 — Division Enrollment & Coach Health
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time player headcount vs. matched volunteer coach capacity per division.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            🔄 Refresh
          </button>

          <button
            onClick={handleSendReport}
            disabled={sendingEmail}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-emerald-500 disabled:opacity-50 transition-all"
          >
            {sendingEmail ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                Sending...
              </>
            ) : (
              <>
                ✉️ Send Report to Board
              </>
            )}
          </button>
        </div>
      </div>

      {emailStatus && (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs font-medium text-emerald-300">
          {emailStatus}
        </div>
      )}

      {/* Metric Callouts */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4">
          <div className="text-xs font-medium text-slate-400">Total Enrolled Players</div>
          <div className="mt-1 text-2xl font-black text-emerald-400">{data.totalPlayers}</div>
          <div className="mt-1 text-[11px] text-emerald-500/80">100% Paid Registrations</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4">
          <div className="text-xs font-medium text-slate-400">Matched Coaches</div>
          <div className="mt-1 text-2xl font-black text-blue-400">{data.totalCoaches}</div>
          <div className="mt-1 text-[11px] text-blue-400/80">Head & Assistant Pool</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4">
          <div className="text-xs font-medium text-slate-400">Estimated Teams</div>
          <div className="mt-1 text-2xl font-black text-purple-400">~{data.totalEstimatedTeams}</div>
          <div className="mt-1 text-[11px] text-purple-400/80">Across 10 Divisions</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4">
          <div className="text-xs font-medium text-slate-400">Coach Ratio</div>
          <div className="mt-1 text-2xl font-black text-amber-400">1 : 1</div>
          <div className="mt-1 text-[11px] text-amber-400/80">Overall League Health</div>
        </div>
      </div>

      {/* Division Capacity Table */}
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/80 text-slate-300 uppercase tracking-wider font-semibold border-b border-slate-700">
            <tr>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3 text-center">Enrolled Players</th>
              <th className="px-4 py-3 text-center">Roster Size</th>
              <th className="px-4 py-3 text-center">Est. Teams</th>
              <th className="px-4 py-3 text-center">Matched Coaches</th>
              <th className="px-4 py-3 text-right">Health Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 font-medium">
            {data.divisions.map((div, idx) => {
              let badgeBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
              let badgeText = "🟢 Ideal";

              if (div.status === "SURPLUS") {
                badgeBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                badgeText = "🟢 Surplus";
              } else if (div.status === "NEAR_CAPACITY") {
                badgeBg = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                badgeText = "🟡 Need 1 HC";
              } else if (div.status === "DEFICIT") {
                badgeBg = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                badgeText = "🔴 Need Coaches";
              }

              return (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-100">{div.divisionName}</td>
                  <td className="px-4 py-3 text-center text-slate-300 font-bold">{div.enrolledPlayers}</td>
                  <td className="px-4 py-3 text-center text-slate-400">{div.recommendedRosterSize} / team</td>
                  <td className="px-4 py-3 text-center text-purple-300 font-bold">{div.estimatedTeams}</td>
                  <td className="px-4 py-3 text-center text-blue-300 font-bold">{div.matchedCoaches}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeBg}`}>
                      {badgeText}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
