"use client";

import { useCallback, useEffect, useState } from "react";

import {
  formatCents,
  springLeagueLabel,
  unplaceableReasonText,
  type SpringSplitOrg,
  type UnplaceableReason,
} from "@/lib/sportsConnect/divisionLeagueSplit";
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
  springSplitEligible?: boolean;
};

type LeagueTotals = {
  organizationId: SpringSplitOrg;
  seasonYear: number;
  wouldAdd: number;
  alreadySameLeague: number;
  alreadyOtherLeague: number;
  amountCents: number;
  amountPaidCents: number;
  balanceCents: number;
};

type UnplaceableDivision = {
  programName: string;
  divisionName: string;
  rowCount: number;
  reason: UnplaceableReason;
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
  totals: {
    wouldAdd: number;
    alreadyPresent: number;
    skipped: SkipCounts;
    unplaceable?: number;
    alreadyOtherLeague?: number;
  };
  leagues?: LeagueTotals[];
  unplaceable?: UnplaceableDivision[];
  programs: Array<{
    programName: string;
    disposition: "skip" | "map" | "split";
    organizationId: string | null;
    seasonYear: number | null;
    divisions: Array<{
      divisionName: string;
      wouldAdd: number;
      alreadyPresent: number;
      skipped: SkipCounts;
      organizationId?: SpringSplitOrg | null;
      alreadySameLeague?: number;
      alreadyOtherLeague?: number;
      unplaceable?: number;
      placement?: "tag" | "fixed" | "override" | "unplaceable";
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
  alreadyOtherLeague: number | null;
  undoneEnrollmentCount: number | null;
  splitBatch?: boolean;
};

type DivisionOverride = {
  divisionName: string;
  organizationId: SpringSplitOrg;
};

type MapRow = {
  programName: string;
  rowCount: number;
  fallLocked: boolean;
  springSplitEligible: boolean;
  action: "skip" | "map" | "split";
  organizationId: "gonzales" | "ascension" | "fallball";
  seasonYear: number;
  divisionOverrides: DivisionOverride[];
};

const SKIP_LABELS: Record<keyof SkipCounts, string> = {
  unmapped_or_fall: "Unmapped or Fall",
  not_completed: "Not completed",
  umpire: "Umpire",
  missing_birth_date: "Missing birth date",
  unparseable: "Unparseable",
};

const ORGS = [
  { id: "gonzales", label: "Gonzales DYB" },
  { id: "ascension", label: "Ascension LL" },
  { id: "fallball", label: "Fall Ball" },
] as const;

async function readJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

export default function RegistrationHistoryImportPanel({
  targetOrg,
  canSplitByDivision = false,
}: {
  targetOrg: ContentOrgId;
  canSplitByDivision?: boolean;
}) {
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
  const [previewStale, setPreviewStale] = useState(false);

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
    return programs.map((program) => {
      if (program.fallLocked || program.action === "skip") {
        return { programName: program.programName, action: "skip" };
      }
      if (program.action === "split") {
        return {
          programName: program.programName,
          action: "split",
          seasonYear: program.seasonYear,
          divisionOverrides: program.divisionOverrides,
        };
      }
      return {
        programName: program.programName,
        action: "map",
        organizationId: program.organizationId,
        seasonYear: program.seasonYear,
      };
    });
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
    setPreviewStale(false);
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
        (data.programs || []).map((program) => {
          const springSplitEligible = program.springSplitEligible === true;
          const suggestSplit =
            canSplitByDivision &&
            springSplitEligible &&
            !program.suggestion.fallLocked &&
            program.suggestion.action === "skip";
          return {
            programName: program.programName,
            rowCount: program.rowCount,
            fallLocked: program.suggestion.fallLocked,
            springSplitEligible,
            action: suggestSplit ? "split" : program.suggestion.action,
            organizationId: program.suggestion.organizationId || "gonzales",
            seasonYear: program.suggestion.seasonYear || new Date().getFullYear(),
            divisionOverrides: [],
          };
        }),
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
      setPreviewStale(false);
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
        runs?: Array<{
          organizationId: string;
          seasonYear: number;
          inserted: number;
          alreadyOtherLeague?: number;
        }>;
      };
      const lines = (data.runs || []).map(
        (run) => `${leagueName(run.organizationId)} ${run.seasonYear}: added ${run.inserted}`,
      );
      const otherLeague = (data.runs || []).reduce(
        (sum, run) => sum + (run.alreadyOtherLeague ?? 0),
        0,
      );
      setCommitResult(
        [
          `Committed. Added ${data.totals?.wouldAdd ?? 0}. Already on file ${data.totals?.alreadyPresent ?? 0}.`,
          otherLeague > 0
            ? `${otherLeague} already in the other league were left there.`
            : "",
          lines.join(" "),
        ]
          .filter(Boolean)
          .join(" "),
      );
      setPreview(null);
      setPreviewRunId("");
      setPreviewStale(false);
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
    setPreviewStale(false);
    setPrograms((current) => current.map((program, i) => (i === index ? { ...program, ...patch } : program)));
  }

  function setDivisionLeague(index: number, divisionName: string, organizationId: string) {
    setPreviewStale(true);
    setPrograms((current) =>
      current.map((program, i) => {
        if (i !== index) return program;
        const rest = program.divisionOverrides.filter((entry) => entry.divisionName !== divisionName);
        if (organizationId !== "gonzales" && organizationId !== "ascension") {
          return { ...program, divisionOverrides: rest };
        }
        return {
          ...program,
          divisionOverrides: [...rest, { divisionName, organizationId }],
        };
      }),
    );
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
          {canSplitByDivision
            ? " Split by division league saves Gonzales and Ascension from one Spring program. Undo of that import removes both leagues."
            : ""}
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
            setPreviewStale(false);
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
          disabled={
            !previewRunId ||
            previewStale ||
            (preview?.unplaceable?.length ?? 0) > 0 ||
            busy !== ""
          }
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
                        value={
                          program.action === "split"
                            ? "split"
                            : program.action === "skip"
                              ? "skip"
                              : program.organizationId
                        }
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === "skip") updateProgram(index, { action: "skip" });
                          else if (value === "split") updateProgram(index, { action: "split" });
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
                          <option key={org.id} value={org.id}>
                            {org.label}
                          </option>
                        ))}
                        {canSplitByDivision && program.springSplitEligible ? (
                          <option value="split">Split by division league</option>
                        ) : null}
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
          {canSplitByDivision && programs.some((program) => program.springSplitEligible) ? (
            <p className="mt-2 text-xs text-zinc-400">
              Split by division league reads each division name. DYB goes to Gonzales. LLB goes to
              Ascension. Tee-ball, 7U Minors, 8U Minors, and 7/8 Majors go to Ascension. 14U and 17U
              go to Gonzales. If a division does not fit, pick the league yourself. Commit stays off
              until you do.
            </p>
          ) : null}
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
          <p className="text-sm text-zinc-200">
            {preview.totalRows} rows. Birth date coverage {preview.birthDateCoveragePercent}%. Would
            add {preview.totals.wouldAdd}. Already on file {preview.totals.alreadyPresent}.
            {(preview.totals.alreadyOtherLeague ?? 0) > 0
              ? ` ${preview.totals.alreadyOtherLeague} of those are already in the other league and will be left there.`
              : ""}
          </p>
          {previewStale ? (
            <p className="text-sm text-amber-200">
              League choices changed. Dry-run again before commit.
            </p>
          ) : null}
          <p className="text-xs text-zinc-400">{preview.keyNote}</p>
          <SkipLine skipped={preview.totals.skipped} />
          {(preview.leagues?.length ?? 0) > 0 ? (
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-zinc-100">By league</h3>
              {preview.leagues?.map((league) => (
                <p key={`${league.organizationId}-${league.seasonYear}`} className="text-sm text-zinc-200">
                  {springLeagueLabel(league.organizationId)} {league.seasonYear}: add {league.wouldAdd}.
                  Already on file in this league {league.alreadySameLeague}. Already on file in the
                  other league {league.alreadyOtherLeague}. Fees {formatCents(league.amountCents)}{" "}
                  (paid {formatCents(league.amountPaidCents)}, balance {formatCents(league.balanceCents)}).
                </p>
              ))}
            </div>
          ) : null}
          {(preview.unplaceable?.length ?? 0) > 0 ? (
            <div className="space-y-2 rounded-lg border border-amber-900/60 bg-amber-950/30 p-3">
              <p className="text-sm text-amber-100">
                These divisions need a league. Commit stays off until each one has a league and you
                dry-run again.
              </p>
              {preview.unplaceable?.map((division) => {
                const index = programs.findIndex((program) => program.programName === division.programName);
                const chosen =
                  programs[index]?.divisionOverrides.find(
                    (entry) => entry.divisionName === division.divisionName,
                  )?.organizationId ?? "";
                return (
                  <div
                    key={`${division.programName}-${division.divisionName}`}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="text-zinc-100">
                      {division.divisionName}: {division.rowCount}{" "}
                      {division.rowCount === 1 ? "player" : "players"}. {unplaceableReasonText(division.reason)}
                    </span>
                    <select
                      aria-label={`League for ${division.divisionName}`}
                      value={chosen}
                      onChange={(event) => setDivisionLeague(index, division.divisionName, event.target.value)}
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1"
                    >
                      <option value="">Choose a league</option>
                      <option value="gonzales">Gonzales DYB</option>
                      <option value="ascension">Ascension LL</option>
                    </select>
                  </div>
                );
              })}
            </div>
          ) : null}
          {preview.programs.map((program) => (
            <div key={program.programName} className="space-y-1">
              <p className="text-sm text-zinc-100">
                {program.programName}
                {program.disposition === "map"
                  ? ` → ${leagueName(program.organizationId || "")} ${program.seasonYear}`
                  : program.disposition === "split"
                    ? ` → split by division league, ${program.seasonYear}`
                    : " → skip"}
                . Would add {program.totals.wouldAdd}. Already on file {program.totals.alreadyPresent}.
              </p>
              <ul className="space-y-1 text-xs text-zinc-400">
                {program.divisions.map((division) => (
                  <li key={division.divisionName}>
                    {division.divisionName}
                    {division.organizationId ? ` → ${springLeagueLabel(division.organizationId)}` : ""}
                    {division.unplaceable ? " → needs a league" : ""}: add {division.wouldAdd}
                    {program.disposition === "split"
                      ? `, already in this league ${division.alreadySameLeague ?? 0}, already in the other league ${division.alreadyOtherLeague ?? 0}`
                      : `, present ${division.alreadyPresent}`}
                    {division.unplaceable ? `, need a league ${division.unplaceable}` : ""}.{" "}
                    <SkipLine skipped={division.skipped} />
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
                  {run.seasonYear} · {run.status} · inserted {run.inserted ?? 0} · already on file{" "}
                  {run.alreadyPresent ?? 0}
                  {(run.alreadyOtherLeague ?? 0) > 0
                    ? ` · ${run.alreadyOtherLeague} left in the other league`
                    : ""}
                  {run.splitBatch ? " · split import" : ""}
                  {run.sourceFileName ? ` · ${run.sourceFileName}` : ""}
                </p>
                {run.status === "DONE" ? (
                  run.splitBatch && !canSplitByDivision ? (
                    <p className="mt-2 text-xs text-zinc-400">
                      A master admin has to undo this split import.
                    </p>
                  ) : (
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
                          {run.splitBatch
                            ? `This deletes ${undoCounts[run.id]} enrollment rows from this split import. Every league saved in that import is removed. Rows that were already on file stay.`
                            : `This deletes ${undoCounts[run.id]} enrollment rows from this batch. Rows that were already present stay.`}
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
                  )
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

function leagueName(org: string): string {
  if (org === "gonzales") return "Gonzales DYB";
  if (org === "ascension") return "Ascension LL";
  if (org === "fallball") return "Fall Ball";
  return org;
}

function SkipLine({ skipped }: { skipped: SkipCounts }) {
  const parts = (Object.keys(SKIP_LABELS) as Array<keyof SkipCounts>)
    .filter((key) => skipped[key] > 0)
    .map((key) => `${SKIP_LABELS[key]} ${skipped[key]}`);
  if (!parts.length) return <span>No skipped rows.</span>;
  return <span>Skipped: {parts.join(", ")}.</span>;
}
