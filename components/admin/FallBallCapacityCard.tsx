"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  FallBallCapacityReport,
  FallBallPlayerDataSource,
} from "@/lib/sportsConnect/fallballCapacity";

const PLAYER_SOURCE_LABEL: Record<FallBallPlayerDataSource, string> = {
  team_rosters: "From teams entered in Team Manager",
  sports_connect_sync: "From the last synced SportsConnect enrollment file",
  manual_fallback: "Manually recorded snapshot — not live data",
  none: "No enrollment data yet",
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
          <span className="text-sm font-medium">Loading division capacity…</span>
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

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-6 text-zinc-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            {data.seasonLabel} — Division Enrollment &amp; Coach Capacity
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {PLAYER_SOURCE_LABEL[data.playerDataSource]}.{" "}
            {data.lastPlayerRegSyncAt
              ? `Last SportsConnect sync: ${new Date(data.lastPlayerRegSyncAt).toLocaleString("en-US")}.`
              : "No SportsConnect enrollment file has been synced yet."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void fetchData()}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white"
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={() => void handleSendReport()}
            disabled={sendingEmail}
            className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white"
          >
            {sendingEmail ? "Sending…" : "Send Report to Board"}
          </button>
        </div>
      </div>

      {emailStatus ? (
        <div
          className={`mt-3 rounded-lg border p-3 text-xs font-medium ${
            emailStatus.ok
              ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300"
              : "border-rose-900/60 bg-rose-950/40 text-rose-300"
          }`}
        >
          {emailStatus.message}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-zinc-400">Total Enrolled Players</div>
            {data.playerDataSource === "manual_fallback" ? (
              <span className="rounded-full border border-amber-800/60 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                Manual
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-400">{data.totalPlayers}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4">
          <div className="text-xs font-medium text-zinc-400">Matched Coaches</div>
          <div className="mt-1 text-2xl font-black text-blue-400">{data.totalCoaches}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-4">
          <div className="text-xs font-medium text-zinc-400">Teams Formed</div>
          <div className="mt-1 text-2xl font-black text-purple-400">{data.totalTeams}</div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-800/80 text-zinc-300 uppercase tracking-wider font-semibold border-b border-zinc-700">
            <tr>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3 text-center">Enrolled Players</th>
              <th className="px-4 py-3 text-center">Teams</th>
              <th className="px-4 py-3 text-center">Matched Coaches</th>
              <th className="px-4 py-3 text-right">Health Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/40 font-medium">
            {data.divisions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  {data.teamsFormed
                    ? `No teams have been entered for ${data.seasonLabel} yet.`
                    : "Teams haven't been formed yet — per-division breakdown will appear here once they are. Totals above reflect pre-team-formation enrollment."}
                </td>
              </tr>
            ) : (
              data.divisions.map((div) => {
                const badge =
                  div.status === "SURPLUS"
                    ? { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Surplus" }
                    : div.status === "NEAR_CAPACITY"
                      ? { cls: "bg-amber-500/10 text-amber-400 border-amber-500/20", label: "Near capacity" }
                      : div.status === "DEFICIT"
                        ? { cls: "bg-rose-500/10 text-rose-400 border-rose-500/20", label: "Needs coaches" }
                        : { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Ideal" };

                return (
                  <tr key={div.divisionName} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-semibold text-zinc-100">{div.divisionName}</td>
                    <td className="px-4 py-3 text-center text-zinc-300 font-bold">{div.enrolledPlayers}</td>
                    <td className="px-4 py-3 text-center text-purple-300 font-bold">{div.teamCount}</td>
                    <td className="px-4 py-3 text-center text-blue-300 font-bold">{div.matchedCoaches}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
