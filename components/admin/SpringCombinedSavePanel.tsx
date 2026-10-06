"use client";

import { useState } from "react";

import {
  combinedSavePreview,
  removedCodesForCombinedSave,
  type CombinedSavePreview,
  type SpringLeagueTable,
} from "@/lib/admin/springCombined/save";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-60";

function baselinesFrom(leagues: readonly SpringLeagueTable[]) {
  return {
    gonzales: leagues.find((league) => league.organizationId === "gonzales")?.baselineToken ?? "",
    ascension: leagues.find((league) => league.organizationId === "ascension")?.baselineToken ?? "",
  };
}

export function SpringCombinedSaveConfirm({
  preview,
  saving,
  error,
  onSave,
  onBack,
}: {
  preview: CombinedSavePreview;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-white/20 bg-zinc-950 p-4 sm:p-6"
      data-testid="spring-save-confirm"
    >
      <h2 className="text-xl font-semibold text-white">Review before saving</h2>
      <p className="mt-2 text-sm text-zinc-300">
        Season {preview.seasonYear}. One save writes Gonzales DYB and Ascension LL. Fall Ball is not changed. Undo last
        save puts both leagues back.
      </p>
      <div className="mt-4 space-y-4">
        {preview.leagues.map((league) => (
          <div key={league.organizationId} data-testid={`spring-save-${league.organizationId}`}>
            <h3 className="text-base font-semibold text-white">{league.title}</h3>
            <p className="mt-1 text-sm text-zinc-400">{league.cutoffText}</p>
            {league.changes.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-300">No division changes.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Division</th>
                      <th className="py-2 pr-3 font-semibold">Now</th>
                      <th className="py-2 pr-3 font-semibold">After save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {league.changes.map((change) => (
                      <tr key={`${change.kind}-${change.label}`} className="border-t border-zinc-800 text-zinc-100">
                        <td className="py-2 pr-3">
                          {change.label}
                          {change.preset ? (
                            <span className="mt-1 block text-xs text-zinc-400">{change.preset}</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">{change.before}</td>
                        <td className="py-2 pr-3">{change.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-amber-200" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={buttonClass} data-testid="spring-save-confirm-button" disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save both leagues"}
        </button>
        <button type="button" className={buttonClass} disabled={saving} onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}

export function SpringCombinedSavePanel({
  seasonYear,
  proposed,
  leagues,
  onSaved,
}: {
  seasonYear: number;
  proposed: { cutoff: LeagueAgeRule; divisions: readonly DivisionAgeConfig[] } | null;
  leagues: readonly SpringLeagueTable[];
  onSaved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = proposed ? combinedSavePreview(leagues, proposed, seasonYear) : null;
  const undoAvailable = leagues.length === 2 && leagues.every((league) => league.undoAvailable);

  async function save() {
    if (!proposed || !preview || !preview.ok) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/division-ages/spring", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seasonYear,
          cutoff: proposed.cutoff,
          divisions: proposed.divisions,
          baselines: baselinesFrom(leagues),
          removedCodes: removedCodesForCombinedSave(leagues, proposed),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error || "Could not save division ages.");
        return;
      }
      setOpen(false);
      onSaved("Saved. This combined table is what is stored for Gonzales DYB and Ascension LL. Undo last save restores the previous tables.");
    } catch {
      setError("Could not save division ages.");
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/division-ages/spring", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seasonYear, baselines: baselinesFrom(leagues) }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error || "Could not undo the last save.");
        return;
      }
      setOpen(false);
      onSaved("Undone. Both leagues are back to the tables from before the last save.");
    } catch {
      setError("Could not undo the last save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="spring-save-panel">
      {open && preview?.ok ? (
        <SpringCombinedSaveConfirm
          preview={preview.preview}
          saving={saving}
          error={error}
          onSave={() => void save()}
          onBack={() => {
            if (saving) return;
            setOpen(false);
            setError(null);
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            data-testid="spring-save-review"
            disabled={!proposed || saving || (preview != null && !preview.ok)}
            onClick={() => {
              setError(preview && !preview.ok ? preview.error : null);
              if (preview?.ok) setOpen(true);
            }}
          >
            Review changes
          </button>
          {undoAvailable ? (
            <button type="button" className={buttonClass} data-testid="spring-undo" disabled={saving} onClick={() => void undo()}>
              Undo last save
            </button>
          ) : null}
        </div>
      )}
      {!open && error ? (
        <p className="text-sm text-amber-200" role="alert">
          {error}
        </p>
      ) : null}
      {!open && preview && !preview.ok ? (
        <p className="text-sm text-amber-200" role="alert">
          {preview.error}
        </p>
      ) : null}
    </div>
  );
}
