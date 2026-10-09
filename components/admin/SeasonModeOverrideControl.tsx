"use client";

import { useState } from "react";

import {
  SEASON_MODE_LABELS,
  SEASON_MODES,
  type SeasonMode,
  type SeasonModeSnapshot,
} from "@/lib/season/mode";

type Props = {
  initial: SeasonModeSnapshot;
};

export default function SeasonModeOverrideControl({ initial }: Props) {
  const [snapshot, setSnapshot] = useState(initial);
  const [saving, setSaving] = useState<SeasonMode | "clear" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(seasonModeOverride: SeasonMode | null) {
    setSaving(seasonModeOverride ?? "clear");
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/season-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: snapshot.organizationId,
          seasonModeOverride,
        }),
      });
      const data = (await res.json()) as SeasonModeSnapshot & { error?: string };
      if (!res.ok) throw new Error(data.error || "Season mode override could not be saved.");
      setSnapshot(data);
      setMessage(
        seasonModeOverride
          ? `Override saved: ${SEASON_MODE_LABELS[seasonModeOverride]}.`
          : "Override cleared. This league is using the automatic mode.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Season mode override could not be saved.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Master admin</p>
      <h2 className="mt-1 text-xl font-semibold text-white">Season mode</h2>
      <p className="mt-2 max-w-3xl text-sm text-zinc-400">
        Automatic follows the season dates and the registration window. An override stays on this
        league until you clear it. Menus and the dashboard still use the live-season dates.
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Automatic</dt>
          <dd className="mt-1 font-semibold text-white">{SEASON_MODE_LABELS[snapshot.automatic]}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Override</dt>
          <dd className="mt-1 font-semibold text-white">
            {snapshot.override ? SEASON_MODE_LABELS[snapshot.override] : "Using the automatic mode"}
          </dd>
        </div>
      </dl>

      {snapshot.storageReady ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {SEASON_MODES.map((mode) => {
            const selected = snapshot.override === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={saving !== null || selected}
                onClick={() => void save(mode)}
                className={
                  selected
                    ? "rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-200"
                    : "rounded-full border border-zinc-700 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500 disabled:opacity-60"
                }
              >
                {saving === mode ? "Saving…" : SEASON_MODE_LABELS[mode]}
              </button>
            );
          })}
          {snapshot.override ? (
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void save(null)}
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:border-zinc-500 disabled:opacity-60"
            >
              {saving === "clear" ? "Clearing…" : "Clear override"}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-amber-200">
          The override cannot be saved on this database yet. The mode above is the automatic one.
        </p>
      )}

      {message ? <p className="mt-3 text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
    </section>
  );
}
