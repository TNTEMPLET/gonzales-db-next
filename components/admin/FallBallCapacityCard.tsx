"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  FallBallCapacityReport,
  FallBallPlayerDataSource,
} from "@/lib/sportsConnect/fallballCapacity";

const PLAYER_SOURCE_BADGE: Record<FallBallPlayerDataSource, { label: string; cls: string }> = {
  team_rosters: {
    label: "From Team Manager",
    cls: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  },
  sports_connect_sync: {
    label: "From SportsConnect sync",
    cls: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  },
  manual_fallback: {
    label: "Manual snapshot — not live",
    cls: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  },
};

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export default function FallBallCapacityCard() {
  const [data, setData] = useState<FallBallCapacityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/sports-connect/capacity", { cache: "no-store" });
      const json = await safeJson(res);
      if (!res.ok) {
        throw new Error(String(json.error || "Failed to load capacity data"));
      }
      setData((json.data as FallBallCapacityReport) ?? null);
    } catch (err) {
      setData(null);
      setLoadError(err instanceof Error ? err.message : "Failed to load capacity data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function load() {
      void fetchData();
    }
    load();
  }, [fetchData]);

  const handleSendReport = async () => {
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const res = await fetch("/api/cron/fallball-daily-report", { method: "POST" });
      const json = await safeJson(res);
      if (res.ok && json.success) {
        setEmailStatus({ ok: true, message: "Report sent to apboard@apbaseball.com." });
      } else {
        setEmailStatus({
          ok: false,
          message: String(json.error || "Failed to send report."),
        });
      }
    } catch (err) {
      setEmailStatus({
        ok: false,
        message: err instanceof Error ? err.message : "Send failed",
      });
    } finally {
      setSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-6 text-zinc-300">
        <div className="flex items-center space-x-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <span className="text-sm font-medium">Loading Fall Ball Division Capacity...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-6 text-rose-200">
        <p className="text-sm font-semibold">Could not load division capacity</p>
        <p className="mt-1 text-xs text-rose-300/80">{loadError}</p>
        <button
          type="button"
          onClick={() => void fetchData()}
          className="mt-3 rounded-lg border border-rose-700 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-900/40"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Sums the table's own columns rather than reusing data.totalCoaches — a
  // coach can now match more than one division (see matchStandardDivisions
  // in fallballCapacity.ts), so this footer total can run higher than the
  // distinct-coach headline above when that happens; each number is correct
  // for what it represents.
  const matchedCoachesColumnTotal = data.divisions.reduce((sum, div) => sum + div.matchedCoaches, 0);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-6 text-zinc-100 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${PLAYER_SOURCE_BADGE[data.playerDataSource].cls}`}
            >
              {PLAYER_SOURCE_BADGE[data.playerDataSource].label}
            </span>
            {data.lastPlayerRegSyncFileName && (
              <span className="text-xs text-zinc-400">
                Source: {data.lastPlayerRegSyncFileName}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-white">
            📊 {data.seasonLabel} — Division Enrollment &amp; Coaching Capacity
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Division player headcounts, estimated teams, and matched volunteer coach capacity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void fetchData()}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white"
          >
            🔄 Refresh
          </button>

          <button
            type="button"
            onClick={() => void handleSendReport()}
            disabled={sendingEmail}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md transition-all"
          >
            {sendingEmail ? "Sending..." : "✉️ Send Report to Board"}
          </button>
        </div>
      </div>

      {emailStatus && (
        <div
          className={`mt-3 rounded-lg border p-3 text-xs font-medium ${
            emailStatus.ok
              ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300"
              : "border-rose-900/60 bg-rose-950/40 text-rose-300"
          }`}
        >
          {emailStatus.message}
        </div>
      )}

      {/* Metric Callouts */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4">
          <div className="text-xs font-medium text-zinc-400">Total Enrolled Players</div>
          <div className="mt-1 text-2xl font-black text-emerald-400">{data.totalPlayers}</div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4">
          <div className="text-xs font-medium text-zinc-400">Matched Coaches</div>
          <div className="mt-1 text-2xl font-black text-blue-400">{data.totalCoaches}</div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4">
          <div className="text-xs font-medium text-zinc-400">Estimated Teams</div>
          <div className="mt-1 text-2xl font-black text-purple-400">~{data.totalEstimatedTeams}</div>
          <div className="mt-1 text-[11px] text-purple-400/80">Across 10 Divisions</div>
        </div>
      </div>

      {/* Division Capacity Table */}
      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-800/80 text-zinc-300 uppercase tracking-wider font-semibold border-b border-zinc-700">
            <tr>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3 text-center">Enrolled Players</th>
              <th className="px-4 py-3 text-center">Roster Target</th>
              <th className="px-4 py-3 text-center">Est. Teams</th>
              <th className="px-4 py-3 text-center">Matched Coaches</th>
              <th className="px-4 py-3 text-right">Health Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/40 font-medium">
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
                <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-zinc-100">{div.divisionName}</td>
                  <td className="px-4 py-3 text-center text-zinc-300 font-bold">{div.enrolledPlayers}</td>
                  <td className="px-4 py-3 text-center text-zinc-400">{div.recommendedRosterSize} / team</td>
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
          <tfoot className="border-t-2 border-zinc-700 bg-zinc-800/60 font-bold">
            <tr>
              <td className="px-4 py-3 text-zinc-100">Total (10 Divisions)</td>
              <td className="px-4 py-3 text-center text-emerald-400">{data.totalPlayers}</td>
              <td className="px-4 py-3 text-center text-zinc-500">—</td>
              <td className="px-4 py-3 text-center text-purple-300">{data.totalEstimatedTeams}</td>
              <td className="px-4 py-3 text-center text-blue-300">{matchedCoachesColumnTotal}</td>
              <td className="px-4 py-3 text-right text-zinc-500">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {matchedCoachesColumnTotal !== data.totalCoaches && (
        <p className="mt-2 text-[11px] text-zinc-500">
          Matched Coaches total above ({matchedCoachesColumnTotal}) can exceed the {data.totalCoaches} distinct
          converted coaches shown in Matched Coaches up top — a coach interested in more than one division is
          counted toward each one.
        </p>
      )}
    </div>
  );
}
