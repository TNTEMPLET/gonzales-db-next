"use client";

import { useCallback, useEffect, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";

type Suggestion = {
  action: "skip" | "map";
  organizationId: "gonzales" | "ascension" | "fallball" | null;
  seasonYear: number | null;
  fallLocked: boolean;
};

type ProgramInventory = {
  programName: string;
  rowCount: number;
  suggestion: Suggestion;
};

type SkipCounts = {
  unmapped_or_fall: number;
  not_completed: number;
  umpire: number;
  missing_birth_date: number;
  unparseable: number;
};

type HistoryPreview = {
  totalRows: number;
  birthDateCoveragePercent: number;
  keyNote: string;
  totals: { wouldAdd: number; alreadyPresent: number; skipped: SkipCounts };
  programs: Array<{
    programName: string;
    disposition: "skip" | "map";
    organizationId: string | null;
    seasonYear: number | null;
    divisions: Array<{
      divisionName: string;
      wouldAdd: number;
      alreadyPresent: number;
      skipped: SkipCounts;
    }>;
    totals: { wouldAdd: number; alreadyPresent: number; skipped: SkipCounts };
  }>;
};

type HistoryRun = {
  id: string;
  seasonYear: number;
  status: string;
  sourceFileName: string | null;
  createdAt: string;
  inserted: number | null;
  alreadyPresent: number | null;
  undoneEnrollmentCount: number | null;
};

type MapRow = {
  programName: string;
  rowCount: number;
  fallLocked: boolean;
  action: "skip" | "map";
  organizationId: "gonzales" | "ascension" | "fallball";
  seasonYear: number;
};

const SKIP_LABELS: Record<keyof SkipCounts, string> = {
  unmapped_or_fall: "Unmapped or Fall",
  not_completed: "Not completed",
  umpire: "Umpire",
  missing_birth_date: "Missing birth date",
  unparseable: "Unparseable",
};

const ORGS = ["gonzales", "ascension", "fallball"] as const;

async function readJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export default function RegistrationHistoryImportPanel({ targetOrg }: { targetOrg: ContentOrgId }) {
  const orgQuery = `org=${targetOrg}`;
  const [file, setFile] = useState<File | null>(null);
  const [programs, setPrograms] = useState<MapRow[]>([]);
  const [previewRunId, setPreviewRunId] = useState("");
  const [preview, setPreview] = useState<HistoryPreview | null>(null);
  const [commitResult, setCommitResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [undoCounts, setUndoCounts] = useState<Record<string, number>>({});

  const loadRuns = useCallback(async () => {
    const response = await fetch(`/api/admin/sports-connect/registration-history?${orgQuery}`, {
      cache: "no-store",
    });
    const json = await readJson(response);
    if (!response.ok) return;
    setRuns(Array.isArray(json.data) ? (json.data as HistoryRun[]) : []);
  }, [orgQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRuns();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRuns]);

  function mappingPayload() {
    return programs.map((program) =>
      program.fallLocked || program.action === "skip"
        ? { programName: program.programName, action: "skip" }
        : {
            programName: program.programName,
            action: "map",
            organizationId: program.organizationId,
            seasonYear: program.seasonYear,
          },
    );
  }

  function formWithFile(action: string) {
    if (!file) throw new Error("Choose a file first.");
    const body = new FormData();
    body.set("action", action);
    body.set("file", file);
    body.set("mapping", JSON.stringify(mappingPayload()));
    return body;
  }

  async function inspectFile() {
    setError("");
    setPreview(null);
    setPreviewRunId("");
    setCommitResult("");
    setBusy("inspect");
    try {
      const response = await fetch(`/api/admin/sports-connect/registration-history?${orgQuery}`, {
        method: "POST",
        body: formWithFile("inspect"),
      });
      const json = await readJson(response);
      if (!response.ok) throw new Error(String(json.error || "Could not read the file."));
      const data = json.data as { programs?: ProgramInventory[] };
      setPrograms(
        (data.programs || []).map((program) => ({
          programName: program.programName,
          rowCount: program.rowCount,
          fallLocked: program.suggestion.fallLocked,
          action: program.suggestion.action,
          organizationId: program.suggestion.organizationId || "gonzales",
          seasonYear: program.suggestion.seasonYear || new Date().getFullYear(),
        })),
      );
    } catch (err) {
      setPrograms([]);
      setError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setBusy("");
    }
  }

  async function dryRun() {
    setError("");
    setCommitResult("");
    setBusy("preview");
    try {
      const response = await fetch(`/api/admin/sports-connect/registration-history?${orgQuery}`, {
        method: "POST",
        body: formWithFile("preview"),
      });
      const json = await readJson(response);
      if (!response.ok) throw new Error(String(json.error || "Dry-run failed."));
      const data = json.data as { previewRunId?: string; preview?: HistoryPreview };
      setPreviewRunId(data.previewRunId || "");
      setPreview(data.preview || null);
    } catch (err) {
      setPreview(null);
      setPreviewRunId("");
      setError(err instanceof Error ? err.message : "Dry-run failed.");
    } finally {
      setBusy("");
    }
  }

  async function commitImport() {
    setError("");
    setBusy("commit");
    try {
      const body = formWithFile("commit");
      body.set("previewRunId", previewRunId);
      const response = await fetch(`/api/admin/sports-connect/registration-history?${orgQuery}`, {
        method: "POST",
        body,
      });
      const json = await readJson(response);
      if (!response.ok) throw new Error(String(json.error || "Commit failed."));
      const data = json.data as {
        totals?: HistoryPreview["totals"];
        runs?: Array<{ organizationId: string; seasonYear: number; inserted: number }>;
      };
      const lines = (data.runs || []).map(
        (run) => `${run.organizationId} ${run.seasonYear}: inserted ${run.inserted}`,
      );
      setCommitResult(
        `Committed. Would add ${data.totals?.wouldAdd ?? 0}, already present ${data.totals?.alreadyPresent ?? 0}. ${lines.join(" ")}`,
      );
      setPreview(null);
      setPreviewRunId("");
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed.");
    } finally {
      setBusy("");
    }
  }

  async function previewUndo(runId: string) {
    setError("");
    const response = await fetch(`/api/admin/sports-connect/registration-history?${orgQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, confirm: false }),
    });
    const json = await readJson(response);
    if (!response.ok) {
      setError(String(json.error || "Could not count this batch."));
      return;
    }
    const data = json.data as { enrollmentCount?: number };
    setUndoCounts((current) => ({ ...current, [runId]: data.enrollmentCount ?? 0 }));
  }

  async function confirmUndo(runId: string) {
    setError("");
    setBusy(`undo-${runId}`);
    try {
      const response = await fetch(`/api/admin/sports-connect/registration-history?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, confirm: true }),
      });
      const json = await readJson(response);
      if (!response.ok) throw new Error(String(json.error || "Undo failed."));
      setUndoCounts((current) => {
        const next = { ...current };
        delete next[runId];
        return next;
      });
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo failed.");
    } finally {
      setBusy("");
    }
  }

  function updateProgram(index: number, patch: Partial<MapRow>) {
    setPreview(null);
    setPreviewRunId("");
    setPrograms((current) => current.map((program, i) => (i === index ? { ...program, ...patch } : program)));
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Enrollment only
        </p>
        <h2 className="text-lg font-semibold">Import registration history (Enrollment only)</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Writes Enrollment rows with no team. It does not create teams, roster players, jerseys,
          or coaches. Completed rows only. Fall programs stay on the roster importer. A dry-run is
          required before commit, and undo removes only that batch.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-xs uppercase tracking-wide text-zinc-500">Export file</span>
        <input
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="block w-full text-sm text-zinc-300"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPrograms([]);
            setPreview(null);
            setPreviewRunId("");
            setCommitResult("");
            setError("");
          }}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!file || busy !== ""}
          onClick={() => void inspectFile()}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-100 disabled:opacity-50"
        >
          {busy === "inspect" ? "Reading…" : "List programs"}
        </button>
        <button
          type="button"
          disabled={!file || programs.length === 0 || busy !== ""}
          onClick={() => void dryRun()}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
        >
          {busy === "preview" ? "Dry run…" : "Dry run"}
        </button>
        <button
          type="button"
          disabled={!previewRunId || busy !== ""}
          onClick={() => void commitImport()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy === "commit" ? "Committing…" : "Commit this import"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {commitResult ? <p className="text-sm text-emerald-300">{commitResult}</p> : null}

      {programs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-3">Program</th>
                <th className="py-2 pr-3">Rows</th>
                <th className="py-2 pr-3">Map</th>
                <th className="py-2">Season</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((program, index) => (
                <tr key={program.programName} className="border-t border-zinc-800">
                  <td className="py-2 pr-3 text-zinc-100">{program.programName}</td>
                  <td className="py-2 pr-3">{program.rowCount}</td>
                  <td className="py-2 pr-3">
                    {program.fallLocked ? (
                      <span className="text-zinc-400">Skip — Fall stays on the roster importer</span>
                    ) : (
                      <select
                        aria-label={`Mapping for ${program.programName}`}
                        value={program.action === "skip" ? "skip" : program.organizationId}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === "skip") updateProgram(index, { action: "skip" });
                          else {
                            updateProgram(index, {
                              action: "map",
                              organizationId: value as MapRow["organizationId"],
                            });
                          }
                        }}
                        className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1"
                      >
                        <option value="skip">Skip</option>
                        {ORGS.map((org) => (
                          <option key={org} value={org}>
                            {org}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-2">
                    {program.fallLocked || program.action === "skip" ? (
                      "—"
                    ) : (
                      <input
                        aria-label={`Season for ${program.programName}`}
                        type="number"
                        value={program.seasonYear}
                        onChange={(event) =>
                          updateProgram(index, { seasonYear: Number(event.target.value) || program.seasonYear })
                        }
                        className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
          <p className="text-sm text-zinc-200">
            {preview.totalRows} rows. Birth date coverage {preview.birthDateCoveragePercent}%. Would
            add {preview.totals.wouldAdd}. Already present {preview.totals.alreadyPresent}.
          </p>
          <p className="text-xs text-zinc-400">{preview.keyNote}</p>
          <SkipLine skipped={preview.totals.skipped} />
          {preview.programs.map((program) => (
            <div key={program.programName} className="space-y-1">
              <p className="text-sm text-zinc-100">
                {program.programName}
                {program.disposition === "map"
                  ? ` → ${program.organizationId} ${program.seasonYear}`
                  : " → skip"}
                . Would add {program.totals.wouldAdd}. Already present {program.totals.alreadyPresent}.
              </p>
              <ul className="space-y-1 text-xs text-zinc-400">
                {program.divisions.map((division) => (
                  <li key={division.divisionName}>
                    {division.divisionName}: add {division.wouldAdd}, present {division.alreadyPresent}
                    . <SkipLine skipped={division.skipped} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-200">Registration history batches</h3>
        {runs.length === 0 ? (
          <p className="text-xs text-zinc-500">No registration-history imports for this site yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((run) => (
              <li key={run.id} className="rounded-lg border border-zinc-800 px-3 py-2 text-sm">
                <p>
                  {run.seasonYear} · {run.status} · inserted {run.inserted ?? 0} · already present{" "}
                  {run.alreadyPresent ?? 0}
                  {run.sourceFileName ? ` · ${run.sourceFileName}` : ""}
                </p>
                {run.status === "DONE" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-600 px-3 py-1 text-xs font-semibold"
                      onClick={() => void previewUndo(run.id)}
                    >
                      Undo this import
                    </button>
                    {undoCounts[run.id] !== undefined ? (
                      <>
                        <span className="text-xs text-zinc-300">
                          This deletes {undoCounts[run.id]} enrollment rows from this batch. Rows
                          that were already present stay.
                        </span>
                        <button
                          type="button"
                          disabled={busy === `undo-${run.id}`}
                          className="rounded-lg bg-red-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          onClick={() => void confirmUndo(run.id)}
                        >
                          Delete these {undoCounts[run.id]} rows
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Undone
                    {run.undoneEnrollmentCount !== null
                      ? ` · removed ${run.undoneEnrollmentCount} rows`
                      : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SkipLine({ skipped }: { skipped: SkipCounts }) {
  const parts = (Object.keys(SKIP_LABELS) as Array<keyof SkipCounts>)
    .filter((key) => skipped[key] > 0)
    .map((key) => `${SKIP_LABELS[key]} ${skipped[key]}`);
  if (!parts.length) return <span>No skipped rows.</span>;
  return <span>Skipped: {parts.join(", ")}.</span>;
}
