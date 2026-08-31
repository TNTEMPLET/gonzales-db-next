"use client";

import { useCallback, useEffect, useState } from "react";

import type { PlayerNameCollisionFinding, PlayerNameCollisionReport } from "@/lib/sportsConnect/types";

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function findingKey(f: PlayerNameCollisionFinding) {
  return `${f.ageGroup}::${f.normalizedName}::${f.findingType}`;
}

/**
 * Two different failure modes surface the same way (a name shared by more
 * than one row in a division) but need different fixes -- see
 * lib/sportsConnect/playerNameCollisions.ts:
 *
 *  - COLLAPSED_REGISTRATION: Enrollment shows more real registrations for
 *    this name than the roster has rows -- likely two different kids'
 *    registrations landed on one TeamPlayer row. Fix: add the missing one
 *    as its own roster row, or dismiss (e.g. a cancelled duplicate order).
 *  - DUPLICATE_ROSTER_ROW: the roster itself has 2+ rows for this name --
 *    likely the same kid duplicated. Fix: merge into one, or dismiss
 *    (confirmed two different kids, each correctly rostered).
 */
export default function PlayerNameCollisionsPanel({
  orgQuery,
  seasonYear,
}: {
  orgQuery: string;
  seasonYear: number;
}) {
  const [report, setReport] = useState<PlayerNameCollisionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actioningKey, setActioningKey] = useState<string | null>(null);
  const [mergePicks, setMergePicks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/sports-connect/player-name-collisions?${orgQuery}&seasonYear=${seasonYear}`,
        { cache: "no-store" },
      );
      const json = await safeJson(res);
      if (!res.ok) throw new Error(String(json.error || "Failed to load"));
      setReport(json.data as PlayerNameCollisionReport);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Failed to load player name collisions");
    } finally {
      setLoading(false);
    }
  }, [orgQuery, seasonYear]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async report load
    void load();
  }, [load]);

  async function postAction(body: Record<string, unknown>) {
    const res = await fetch(
      `/api/admin/sports-connect/player-name-collisions?${orgQuery}&seasonYear=${seasonYear}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const json = await safeJson(res);
    if (!res.ok) throw new Error(String(json.error || "Action failed"));
    return json;
  }

  async function runAction(key: string, body: Record<string, unknown>) {
    setActioningKey(key);
    setError("");
    try {
      await postAction(body);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActioningKey(null);
    }
  }

  const findings = report?.findings ?? [];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 space-y-3" id="player-name-collisions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Player name collisions
          </p>
          <p className="text-xs text-zinc-400">
            Same full name found more than once in a division — could be two different kids, or a
            real duplicate. Review each before it affects rosters or communications.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {error ? <p className="text-xs text-amber-300">{error}</p> : null}
      {!loading && findings.length === 0 && !error ? (
        <p className="text-xs text-zinc-500">No open name collisions for this site/season.</p>
      ) : null}
      <div className="space-y-3">
        {findings.map((f) => {
          const key = findingKey(f);
          const busy = actioningKey === key;
          const displayName = f.enrollmentRows[0]?.fullName || f.teamPlayerRows[0]?.fullName || f.normalizedName;
          return (
            <div key={key} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{displayName}</p>
                  <p className="text-[11px] text-zinc-500">
                    {f.ageGroup} ·{" "}
                    {f.findingType === "COLLAPSED_REGISTRATION"
                      ? `${f.enrollmentRows.length} registration(s) found, only ${f.teamPlayerRows.length} on the roster — may have merged two kids into one row`
                      : `${f.teamPlayerRows.length} roster rows share this name — may be the same kid duplicated`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(key, {
                      action: "dismiss",
                      ageGroup: f.ageGroup,
                      normalizedName: f.normalizedName,
                      findingType: f.findingType,
                    })
                  }
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
                >
                  Dismiss
                </button>
              </div>

              {f.enrollmentRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="text-left font-medium pr-3 py-1">Registration</th>
                        <th className="text-left font-medium pr-3 py-1">Order No</th>
                        <th className="text-left font-medium pr-3 py-1">DOB</th>
                        <th className="text-left font-medium pr-3 py-1">Guardian email</th>
                        {f.findingType === "COLLAPSED_REGISTRATION" ? <th className="py-1" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {f.enrollmentRows.map((e) => (
                        <tr key={e.id} className="border-t border-zinc-800 text-zinc-300">
                          <td className="pr-3 py-1">{e.fullName}</td>
                          <td className="pr-3 py-1">{e.sportsConnectOrderNo || "—"}</td>
                          <td className="pr-3 py-1">{fmtDate(e.birthDate)}</td>
                          <td className="pr-3 py-1">{e.guardianEmail || "—"}</td>
                          {f.findingType === "COLLAPSED_REGISTRATION" ? (
                            <td className="py-1 text-right">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void runAction(key, { action: "createMissingPlayer", enrollmentId: e.id })}
                                className="rounded-lg border border-emerald-700 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-60"
                              >
                                Add as separate player
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {f.teamPlayerRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-zinc-500">
                      <tr>
                        {f.findingType === "DUPLICATE_ROSTER_ROW" ? <th className="py-1 pr-2">Keep</th> : null}
                        <th className="text-left font-medium pr-3 py-1">Roster row</th>
                        <th className="text-left font-medium pr-3 py-1">Team</th>
                        <th className="text-left font-medium pr-3 py-1">DOB</th>
                        <th className="text-left font-medium pr-3 py-1">Guardian email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.teamPlayerRows.map((p) => (
                        <tr key={p.id} className="border-t border-zinc-800 text-zinc-300">
                          {f.findingType === "DUPLICATE_ROSTER_ROW" ? (
                            <td className="py-1 pr-2">
                              <input
                                type="radio"
                                name={`survivor-${key}`}
                                checked={mergePicks[key] === p.id}
                                onChange={() => setMergePicks((prev) => ({ ...prev, [key]: p.id }))}
                              />
                            </td>
                          ) : null}
                          <td className="pr-3 py-1">{p.fullName}</td>
                          <td className="pr-3 py-1">{p.teamName}</td>
                          <td className="pr-3 py-1">{fmtDate(p.birthDate)}</td>
                          <td className="pr-3 py-1">{p.guardianEmail || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {f.findingType === "DUPLICATE_ROSTER_ROW" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-zinc-500">
                    Pick the row to keep, then merge — the other row&apos;s blank fields are filled
                    in from it before it&apos;s removed.
                  </p>
                  <button
                    type="button"
                    disabled={busy || !mergePicks[key]}
                    onClick={() => {
                      const survivorTeamPlayerId = mergePicks[key];
                      const loserTeamPlayerId = f.teamPlayerRows.find((p) => p.id !== survivorTeamPlayerId)?.id;
                      if (!survivorTeamPlayerId || !loserTeamPlayerId) return;
                      void runAction(key, { action: "merge", survivorTeamPlayerId, loserTeamPlayerId });
                    }}
                    className="rounded-lg border border-amber-700 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-900/40 disabled:opacity-60"
                  >
                    Merge into selected row
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
