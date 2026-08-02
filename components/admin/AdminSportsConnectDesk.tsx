"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  SportsConnectQualityPanel,
} from "@/components/admin/teams/SportsConnectAssistPanels";
import type {
  ColumnDetectResult,
  RosterQualitySummary,
  SportsConnectImportRunView,
  SportsConnectMappingPresetView,
  SportsConnectReportCatalogEntry,
  SportsConnectReportKind,
} from "@/lib/sportsConnect/types";
import type { ContentOrgId } from "@/lib/siteConfig";

type MultiPreviewSummary = {
  files: Array<{
    fileName: string;
    headers: string[];
    detection: ColumnDetectResult;
    rowCount: number;
    missingGuardianEmailEstimate: number | null;
    suggestedStep: {
      reportKind: SportsConnectReportKind | null;
      adminPath: string;
      adminLabel: string;
      sortOrder: number;
    };
  }>;
  loadOrder: Array<{
    kind: SportsConnectReportKind;
    title: string;
    adminPath: string;
    adminLabel: string;
    assignedFiles: string[];
  }>;
  unassignedFiles: string[];
  message: string;
};

type DeskSectionId =
  | "setup"
  | "checklist"
  | "files"
  | "quality"
  | "history";

const DESK_SECTIONS: Array<{ id: DeskSectionId; label: string }> = [
  { id: "setup", label: "Setup" },
  { id: "checklist", label: "Checklist" },
  { id: "files", label: "File plan" },
  { id: "quality", label: "Quality" },
  { id: "history", label: "History" },
];

function teamsHref(org: ContentOrgId, path = "/admin/teams") {
  return `${path}?org=${org}`;
}

function peopleHref(org: ContentOrgId) {
  return `/admin/people?org=${org}`;
}

function reportKindLabel(kind: string) {
  return kind.replaceAll("_", " ");
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

async function readWorkbookHeadersAndSampleRows(
  file: File,
): Promise<{ headers: string[]; rows: Array<Record<string, unknown>> }> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!firstSheet) return { headers: [], rows: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: false,
  });
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return { headers, rows: rows.slice(0, 50) };
}

export default function AdminSportsConnectDesk({
  targetOrg,
  seasonYear: initialSeasonYear,
  registrationHref,
  registrationLabel,
}: {
  targetOrg: ContentOrgId;
  seasonYear: number;
  registrationHref: string;
  registrationLabel: string;
}) {
  const orgQuery = `org=${targetOrg}`;
  const [activeSection, setActiveSection] = useState<DeskSectionId>("setup");
  const [seasonYear, setSeasonYear] = useState(initialSeasonYear);
  const [catalog, setCatalog] = useState<SportsConnectReportCatalogEntry[]>([]);
  const [quality, setQuality] = useState<RosterQualitySummary | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState("");
  const [presets, setPresets] = useState<SportsConnectMappingPresetView[]>([]);
  const [runs, setRuns] = useState<SportsConnectImportRunView[]>([]);
  const [runsError, setRunsError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewSummary, setPreviewSummary] =
    useState<MultiPreviewSummary | null>(null);
  const [notice, setNotice] = useState("");

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sports-connect/catalog", {
        cache: "no-store",
      });
      const json = await safeJson(res);
      if (!res.ok) return;
      const data = Array.isArray(json.loadOrder)
        ? (json.loadOrder as SportsConnectReportCatalogEntry[])
        : Array.isArray(json.data)
          ? (json.data as SportsConnectReportCatalogEntry[])
          : [];
      setCatalog(data);
    } catch {
      setCatalog([]);
    }
  }, []);

  const loadQuality = useCallback(async () => {
    setQualityLoading(true);
    setQualityError("");
    try {
      const res = await fetch(
        `/api/admin/sports-connect/quality?${orgQuery}&seasonYear=${seasonYear}`,
        { cache: "no-store" },
      );
      const json = await safeJson(res);
      if (!res.ok) {
        throw new Error(String(json.error || "Failed to load quality"));
      }
      setQuality(
        json.data && typeof json.data === "object"
          ? (json.data as RosterQualitySummary)
          : null,
      );
    } catch (err: unknown) {
      setQuality(null);
      setQualityError(
        err instanceof Error ? err.message : "Failed to load quality",
      );
    } finally {
      setQualityLoading(false);
    }
  }, [orgQuery, seasonYear]);

  const loadPresets = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/sports-connect/presets?${orgQuery}&seasonYear=${seasonYear}`,
        { cache: "no-store" },
      );
      const json = await safeJson(res);
      if (!res.ok) return;
      setPresets(
        Array.isArray(json.data)
          ? (json.data as SportsConnectMappingPresetView[])
          : [],
      );
    } catch {
      setPresets([]);
    }
  }, [orgQuery, seasonYear]);

  const loadRuns = useCallback(async () => {
    setRunsError("");
    try {
      const res = await fetch(
        `/api/admin/sports-connect/runs?${orgQuery}&seasonYear=${seasonYear}&limit=40`,
        { cache: "no-store" },
      );
      const json = await safeJson(res);
      if (!res.ok) {
        throw new Error(String(json.error || "Failed to load runs"));
      }
      setRuns(
        Array.isArray(json.data)
          ? (json.data as SportsConnectImportRunView[])
          : [],
      );
    } catch (err: unknown) {
      setRuns([]);
      setRunsError(err instanceof Error ? err.message : "Failed to load runs");
    }
  }, [orgQuery, seasonYear]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadQuality();
    void loadPresets();
    void loadRuns();
  }, [loadQuality, loadPresets, loadRuns]);

  const checklistStatus = useMemo(() => {
    const hasTeams = (quality?.teamCount ?? 0) > 0;
    const hasPlayers = (quality?.playerCount ?? 0) > 0;
    const coachesOk =
      hasTeams && (quality?.teamsWithoutCoaches ?? 0) === 0 && hasPlayers;
    const qualityOk =
      hasPlayers && (quality?.playersMissingGuardianEmail ?? 1) === 0;

    return [
      {
        kind: "TEAM_LIST" as const,
        label: "Team list (optional)",
        done: hasTeams,
        href: teamsHref(targetOrg),
        action: "Import Team List",
      },
      {
        kind: "PLAYER_REG" as const,
        label: "Player registration report",
        done: hasPlayers,
        href: teamsHref(targetOrg),
        action: "Import Players",
      },
      {
        kind: "COACH_VOLUNTEER" as const,
        label: "Coach / volunteer sheet",
        done: coachesOk,
        href: teamsHref(targetOrg),
        action: "Import Coaches",
      },
      {
        kind: "QUALITY" as const,
        label: "Review roster quality",
        done: qualityOk,
        href: "#sports-connect-quality",
        action: "View quality",
      },
    ];
  }, [quality, targetOrg]);

  async function onFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setPreviewBusy(true);
    setPreviewError("");
    setNotice("");
    try {
      const files = Array.from(fileList);
      const payloads = [];
      for (const file of files) {
        const { headers, rows } = await readWorkbookHeadersAndSampleRows(file);
        payloads.push({
          fileName: file.name,
          headers,
          rows,
        });
      }
      const res = await fetch("/api/admin/sports-connect/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: payloads }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        throw new Error(String(json.error || "Failed to preview files"));
      }
      setPreviewSummary(
        json.data && typeof json.data === "object"
          ? (json.data as MultiPreviewSummary)
          : null,
      );
      setActiveSection("files");
      setNotice(
        `Built load plan for ${files.length} file${files.length === 1 ? "" : "s"}. Import each step from Teams when ready.`,
      );

      // Record PREVIEW runs for audit (best-effort).
      for (const file of (json.data as MultiPreviewSummary | null)?.files ??
        []) {
        if (!file.detection.reportKind) continue;
        try {
          await fetch(`/api/admin/sports-connect/runs?${orgQuery}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              seasonYear,
              reportKind: file.detection.reportKind,
              status: "PREVIEW",
              sourceFileName: file.fileName,
              summary: {
                confidence: file.detection.confidence,
                rowCount: file.rowCount,
                missingGuardianEmailEstimate:
                  file.missingGuardianEmailEstimate,
                message: file.detection.message,
              },
            }),
          });
        } catch {
          // audit only
        }
      }
      await loadRuns();
    } catch (err: unknown) {
      setPreviewError(
        err instanceof Error ? err.message : "Failed to preview files",
      );
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Sports Connect workflow
            </p>
            <h2 className="text-lg font-semibold">What do you need to do?</h2>
            <p className="text-xs text-zinc-400 mt-1">
              Assisted export → import for site{" "}
              <span className="text-zinc-200 font-medium">{targetOrg}</span>,
              season {seasonYear}. SportsConnect remains registration SoR.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {DESK_SECTIONS.map((section) => {
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                    active
                      ? "border-brand-purple bg-brand-purple/15 text-brand-purple"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">
              Season year
            </span>
            <input
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(Number(e.target.value) || initialSeasonYear)}
              className="w-28 rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            />
          </label>
          <a
            href={teamsHref(targetOrg)}
            className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold"
          >
            Open Teams import
          </a>
          <a
            href={peopleHref(targetOrg)}
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Open People
          </a>
          <a
            href={registrationHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Family reg: {registrationLabel}
          </a>
        </div>
      </div>

      {activeSection === "setup" ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <h3 className="text-base font-semibold">Setup</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-300">
            <li>Confirm the Target Site above is the program you are loading (never All Sites).</li>
            <li>
              Export the needed reports from SportsConnect (
              {registrationLabel}) for season {seasonYear}.
            </li>
            <li>
              Prefer load order: team list → player registration → coaches → quality review.
            </li>
            <li>
              Save division/team mapping presets on the first player import so later exports are faster.
            </li>
          </ol>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-400 space-y-1">
            <p>
              <span className="text-zinc-200 font-medium">Presets this season:</span>{" "}
              {presets.length === 0
                ? "none yet — save one during player import mapping."
                : presets
                    .map((p) => `${p.name} (${reportKindLabel(p.reportKind)})`)
                    .join(", ")}
            </p>
            <p>
              Deep links:{" "}
              <a className="text-brand-purple hover:underline" href={teamsHref(targetOrg)}>
                Teams
              </a>
              {" · "}
              <a className="text-brand-purple hover:underline" href={peopleHref(targetOrg)}>
                People / volunteers
              </a>
            </p>
          </div>
        </div>
      ) : null}

      {activeSection === "checklist" ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">Guided checklist</h3>
            <button
              type="button"
              onClick={() => {
                void loadQuality();
                void loadRuns();
              }}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Refresh status
            </button>
          </div>
          <div className="space-y-3">
            {checklistStatus.map((step, index) => (
              <div
                key={step.kind}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      step.done
                        ? "bg-emerald-900/60 text-emerald-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {step.done ? "✓" : index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{step.label}</p>
                    <p className="text-xs text-zinc-500">
                      {step.kind === "QUALITY"
                        ? "Missing guardian emails and teams without coaches"
                        : catalog.find((c) => c.kind === step.kind)?.exportHint ||
                          "Export from SportsConnect, then import in Teams."}
                    </p>
                  </div>
                </div>
                <a
                  href={step.href}
                  onClick={(e) => {
                    if (step.href.startsWith("#")) {
                      e.preventDefault();
                      setActiveSection("quality");
                    }
                  }}
                  className="rounded-lg border border-brand-purple px-3 py-1.5 text-xs font-semibold text-brand-purple hover:bg-brand-purple/10"
                >
                  {step.action}
                </a>
              </div>
            ))}
          </div>
          {catalog.length > 0 ? (
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-zinc-900 text-zinc-300">
                  <tr className="text-left">
                    <th className="px-3 py-2">Report</th>
                    <th className="px-3 py-2">Where to import</th>
                    <th className="px-3 py-2">Required columns (any alias)</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((entry) => (
                    <tr key={entry.kind} className="border-t border-zinc-800">
                      <td className="px-3 py-2 font-medium text-zinc-200">
                        {entry.title}
                      </td>
                      <td className="px-3 py-2">
                        <a
                          className="text-brand-purple hover:underline"
                          href={`${entry.adminPath}?org=${targetOrg}`}
                        >
                          {entry.adminLabel}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {entry.requiredColumnGroups
                          .map((g) => g[0] || "column")
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeSection === "files" ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <h3 className="text-base font-semibold">Multi-file load plan</h3>
          <p className="text-xs text-zinc-400">
            Upload one or more SportsConnect exports (CSV/XLSX). Headers are scored and
            assigned to checklist steps. Actual writes still run in Teams (preview → map → import).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              multiple
              disabled={previewBusy}
              onChange={(e) => void onFilesSelected(e.target.files)}
              className="text-sm"
            />
            {previewBusy ? (
              <span className="text-xs text-zinc-400">Building plan…</span>
            ) : null}
          </div>
          {previewError ? (
            <p className="text-sm text-red-300">{previewError}</p>
          ) : null}
          {previewSummary ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-200">{previewSummary.message}</p>
              <div className="space-y-2">
                {previewSummary.loadOrder.map((step) => (
                  <div
                    key={step.kind}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-100">
                        {step.title}
                      </p>
                      <a
                        href={`${step.adminPath}?org=${targetOrg}`}
                        className="text-xs font-semibold text-brand-purple hover:underline"
                      >
                        {step.adminLabel} →
                      </a>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">
                      {step.assignedFiles.length === 0
                        ? "No file assigned yet"
                        : `Files: ${step.assignedFiles.join(", ")}`}
                    </p>
                  </div>
                ))}
              </div>
              {previewSummary.unassignedFiles.length > 0 ? (
                <p className="text-xs text-amber-300">
                  Unassigned files: {previewSummary.unassignedFiles.join(", ")}
                </p>
              ) : null}
              <div className="overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-zinc-300">
                    <tr className="text-left">
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2">Detected</th>
                      <th className="px-3 py-2">Confidence</th>
                      <th className="px-3 py-2">Sample rows</th>
                      <th className="px-3 py-2">Missing guardian email (est.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSummary.files.map((file) => (
                      <tr key={file.fileName} className="border-t border-zinc-800">
                        <td className="px-3 py-2">{file.fileName}</td>
                        <td className="px-3 py-2">
                          {file.detection.reportKind
                            ? reportKindLabel(file.detection.reportKind)
                            : "unknown"}
                        </td>
                        <td className="px-3 py-2">
                          {Math.round(file.detection.confidence * 100)}%
                        </td>
                        <td className="px-3 py-2">{file.rowCount}</td>
                        <td className="px-3 py-2">
                          {file.missingGuardianEmailEstimate == null
                            ? "—"
                            : file.missingGuardianEmailEstimate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              No files planned yet. Choose exports from SportsConnect to generate a plan.
            </p>
          )}
        </div>
      ) : null}

      {activeSection === "quality" ? (
        <div id="sports-connect-quality" className="space-y-4">
          <SportsConnectQualityPanel
            quality={quality}
            loading={qualityLoading}
            error={qualityError}
            onRefresh={() => void loadQuality()}
          />
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-xs text-zinc-400 space-y-2">
            <p className="font-semibold text-zinc-200">Exception handling</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Missing guardian emails → fix in SportsConnect if possible, or edit roster rows in{" "}
                <a className="text-brand-purple hover:underline" href={teamsHref(targetOrg)}>
                  Teams
                </a>
                .
              </li>
              <li>
                Teams without coaches →{" "}
                <a className="text-brand-purple hover:underline" href={teamsHref(targetOrg)}>
                  Teams → Assign Coaches
                </a>{" "}
                or re-run coach import.
              </li>
              <li>
                Volunteer compliance cards →{" "}
                <a className="text-brand-purple hover:underline" href={peopleHref(targetOrg)}>
                  People
                </a>
                .
              </li>
            </ul>
          </div>
        </div>
      ) : null}

      {activeSection === "history" ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">SportsConnect import runs</h3>
              <p className="text-xs text-zinc-400">
                Audit spine for assisted loads (links player/coach batch ids when recorded).
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadRuns()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Refresh
            </button>
          </div>
          {runsError ? (
            <p className="text-sm text-amber-300">{runsError}</p>
          ) : null}
          <div className="overflow-auto rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900 text-zinc-300">
                <tr className="text-left">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Batches / notes</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-zinc-500">
                      No SportsConnect runs recorded yet for this site and season.
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => (
                    <tr key={run.id} className="border-t border-zinc-800">
                      <td className="px-3 py-2">
                        {new Date(run.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {reportKindLabel(run.reportKind)}
                      </td>
                      <td className="px-3 py-2">{run.status}</td>
                      <td className="px-3 py-2">
                        {run.sourceFileName || "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {run.teamPlayerBatchId
                          ? `player batch ${run.teamPlayerBatchId.slice(0, 8)}…`
                          : ""}
                        {run.coachBatchId
                          ? `${run.teamPlayerBatchId ? " · " : ""}coach ${run.coachBatchId.slice(0, 8)}…`
                          : ""}
                        {run.errorMessage
                          ? ` · ${run.errorMessage}`
                          : !run.teamPlayerBatchId && !run.coachBatchId
                            ? run.summary &&
                              typeof run.summary.message === "string"
                              ? String(run.summary.message)
                              : "—"
                            : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-zinc-500">
            Player import history with undo remains on{" "}
            <a className="text-brand-purple hover:underline" href={teamsHref(targetOrg)}>
              Teams → Import History
            </a>
            .
          </p>
        </div>
      ) : null}
    </div>
  );
}
