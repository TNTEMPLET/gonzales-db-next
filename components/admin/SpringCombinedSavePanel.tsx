"use client";

import { useState } from "react";

import {
  combinedSavePreview,
  removedCodesForCombinedSave,
  type CombinedSavePreview,
  type SpringLeagueTable,
} from "@/lib/admin/springCombined/save";
import {
  parseRemovalImpacts,
  removalConfirmLines,
  removalSaveGate,
  removedDivisionRefs,
  type RemovalImpact,
  type RemovedDivisionRef,
} from "@/lib/admin/springCombined/removalGuard";
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
  checking = false,
  error,
  onSave,
  onBack,
}: {
  preview: CombinedSavePreview;
  saving: boolean;
  checking?: boolean;
  error: string | null;
  onSave: () => void;
  onBack: () => void;
}) {
  const busy = saving || checking;
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
        <button type="button" className={buttonClass} data-testid="spring-save-confirm-button" disabled={busy} onClick={onSave}>
          {saving ? "Saving…" : checking ? "Checking…" : "Save both leagues"}
        </button>
        <button type="button" className={buttonClass} disabled={busy} onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}

export function SpringRemovalConfirm({
  impacts,
  saving,
  error,
  onSave,
  onBack,
}: {
  impacts: readonly RemovalImpact[];
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onBack: () => void;
}) {
  const lines = removalConfirmLines(impacts);
  return (
    <section
      className="rounded-2xl border border-white/20 bg-zinc-950 p-4 sm:p-6"
      data-testid="spring-removal-confirm"
    >
      <h2 className="text-xl font-semibold text-white">These names are still in use</h2>
      <div className="mt-4 space-y-2">
        {lines.map((line, index) => (
          <p key={`${index}-${line}`} className="text-sm text-zinc-100" data-testid="spring-removal-count">
            {line}
          </p>
        ))}
      </div>
      <p className="mt-3 text-sm text-zinc-400">Division ages change. Registrations, teams, and drafts stay on the old name.</p>
      {error ? (
        <p className="mt-3 text-sm text-amber-200" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          data-testid="spring-removal-confirm-button"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save both leagues"}
        </button>
        <button type="button" className={buttonClass} disabled={saving} onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}

async function requestRemovalImpacts(
  seasonYear: number,
  removed: readonly RemovedDivisionRef[],
): Promise<RemovalImpact[] | null> {
  const response = await fetch("/api/admin/division-ages/spring/linked", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seasonYear, divisions: removed }),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error || "Could not check registrations for removed divisions.");
  }
  const impacts = parseRemovalImpacts(payload);
  if (!impacts || removalSaveGate({ removed, impacts }) === "check") return null;
  return impacts;
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
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removalImpacts, setRemovalImpacts] = useState<RemovalImpact[] | null>(null);
  const preview = proposed ? combinedSavePreview(leagues, proposed, seasonYear) : null;
  const undoAvailable = leagues.length === 2 && leagues.every((league) => league.undoAvailable);

  async function commit() {
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
      setRemovalImpacts(null);
      onSaved("Saved. This combined table is what is stored for Gonzales DYB and Ascension LL. Undo last save restores the previous tables.");
    } catch {
      setError("Could not save division ages.");
    } finally {
      setSaving(false);
    }
  }

  async function beginSave() {
    if (!proposed || !preview?.ok || saving || checking) return;
    const removed = removedDivisionRefs(leagues, proposed);
    const gate = removalSaveGate({ removed, impacts: removalImpacts });
    if (gate === "confirm") return;
    if (gate === "save") {
      await commit();
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const impacts = await requestRemovalImpacts(seasonYear, removed);
      const nextGate = removalSaveGate({ removed, impacts });
      if (nextGate === "confirm" && impacts) {
        setRemovalImpacts(impacts);
        return;
      }
      if (nextGate !== "save") {
        setError("Could not check registrations for removed divisions.");
        return;
      }
      await commit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check registrations for removed divisions.");
    } finally {
      setChecking(false);
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
      setRemovalImpacts(null);
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
        removalImpacts && removalSaveGate({ removed: removedDivisionRefs(leagues, proposed!), impacts: removalImpacts }) === "confirm" ? (
          <SpringRemovalConfirm
            impacts={removalImpacts}
            saving={saving}
            error={error}
            onSave={() => void commit()}
            onBack={() => {
              if (saving) return;
              setRemovalImpacts(null);
              setError(null);
            }}
          />
        ) : (
          <SpringCombinedSaveConfirm
            preview={preview.preview}
            saving={saving}
            checking={checking}
            error={error}
            onSave={() => void beginSave()}
            onBack={() => {
              if (saving || checking) return;
              setOpen(false);
              setRemovalImpacts(null);
              setError(null);
            }}
          />
        )
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            data-testid="spring-save-review"
            disabled={!proposed || saving || (preview != null && !preview.ok)}
            onClick={() => {
              setRemovalImpacts(null);
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
