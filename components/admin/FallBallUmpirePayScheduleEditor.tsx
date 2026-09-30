"use client";

import { useEffect, useState } from "react";

import type {
  FallBallPayBandRow,
  FallBallPaySchedule,
} from "@/lib/admin/fallBallUmpirePay";
import type { ContentOrgId } from "@/lib/siteConfig";

type Props = {
  targetOrg: ContentOrgId;
  canEdit: boolean;
};

type ScheduleResponse = {
  schedule: FallBallPaySchedule | null;
  defaultSchedule?: FallBallPaySchedule;
  canEdit?: boolean;
  error?: string;
};

function moneyValue(value: number | null): string {
  return value == null ? "" : String(value);
}

export default function FallBallUmpirePayScheduleEditor({ targetOrg, canEdit }: Props) {
  const [schedule, setSchedule] = useState<FallBallPaySchedule | null>(null);
  const [defaults, setDefaults] = useState<FallBallPaySchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/umpire-pay/schedule?org=${targetOrg}`);
      const data = (await res.json()) as ScheduleResponse;
      if (!res.ok) throw new Error(data.error || "Failed to load pay schedule");
      setSchedule(data.schedule);
      setDefaults(data.defaultSchedule ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pay schedule");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg]);

  if (targetOrg !== "fallball") return null;

  const updateBand = (id: string, patch: Partial<FallBallPayBandRow>) => {
    setSchedule((current) => {
      if (!current) return current;
      return {
        ...current,
        bands: current.bands.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      };
    });
  };

  const parseMoney = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  const save = async (next: FallBallPaySchedule) => {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const res = await fetch(`/api/admin/umpire-pay/schedule?org=${targetOrg}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: next }),
      });
      const data = (await res.json()) as ScheduleResponse;
      if (!res.ok) throw new Error(data.error || "Failed to save pay schedule");
      setSchedule(data.schedule);
      setNotice("Saved. New reports use these rates, including past weeks you regenerate.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save pay schedule");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-white">Fall Ball pay schedule</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Dollars and one-game / one-umpire bumps for this season. Tee ball stays off the report.
        {canEdit ? "" : " Only admins can edit rates."}
      </p>
      {loading ? (
        <p className="mt-4 text-xs text-zinc-500">Loading schedule…</p>
      ) : schedule ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-3">Age group</th>
                <th className="py-2 pr-3">Pay / game</th>
                <th className="py-2 pr-3">Umpires</th>
                <th className="py-2 pr-3">One-game night</th>
                <th className="py-2">One umpire</th>
              </tr>
            </thead>
            <tbody>
              {schedule.bands.map((row) => {
                const showOneGame = row.id === "coach" || row.id === "nineTwelve";
                const showOneUmpire = row.id === "fifteenSeventeen";
                const locked = row.id === "tee" || !canEdit;
                return (
                  <tr key={row.id} className="border-t border-zinc-800">
                    <td className="py-2 pr-3 font-medium text-zinc-200">{row.label}</td>
                    <td className="py-2 pr-3">
                      {locked ? (
                        <span className="text-zinc-300">${row.basePay}</span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          max="500"
                          step="1"
                          value={row.basePay}
                          onChange={(e) =>
                            updateBand(row.id, { basePay: Number(e.target.value) || 0 })
                          }
                          className="w-20 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-white"
                        />
                      )}
                    </td>
                    <td className="py-2 pr-3 text-zinc-400">{row.umpiresNote}</td>
                    <td className="py-2 pr-3">
                      {showOneGame && canEdit ? (
                        <input
                          type="number"
                          min="0"
                          max="500"
                          step="1"
                          value={moneyValue(row.oneGameNightPay)}
                          onChange={(e) =>
                            updateBand(row.id, { oneGameNightPay: parseMoney(e.target.value) })
                          }
                          className="w-20 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-white"
                        />
                      ) : showOneGame ? (
                        <span className="text-zinc-300">
                          {row.oneGameNightPay == null ? "—" : `$${row.oneGameNightPay}`}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      {showOneUmpire && canEdit ? (
                        <input
                          type="number"
                          min="0"
                          max="500"
                          step="1"
                          value={moneyValue(row.oneUmpirePay)}
                          onChange={(e) =>
                            updateBand(row.id, { oneUmpirePay: parseMoney(e.target.value) })
                          }
                          className="w-20 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-white"
                        />
                      ) : showOneUmpire ? (
                        <span className="text-zinc-300">
                          {row.oneUmpirePay == null ? "—" : `$${row.oneUmpirePay}`}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {canEdit && schedule ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(schedule)}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            Save rates
          </button>
          {defaults ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save(defaults)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              Reset to 7/30/2026 sheet
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? <p className="mt-2 text-xs text-emerald-300">{notice}</p> : null}
      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
