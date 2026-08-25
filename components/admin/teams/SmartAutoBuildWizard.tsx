"use client";

import { useState } from "react";

import type {
  SportsConnectImportRunView,
  SportsConnectReportCatalogEntry,
  SportsConnectReportKind,
} from "@/lib/sportsConnect/types";
import { SyncedDriveFileMenu } from "./SportsConnectAssistPanels";
import { StatusCountPill } from "./TeamsWorkflowHelpers";

/**
 * "Smart Auto-Build" wizard: one guided flow over the already-built
 * app/api/admin/teams/smart-build/* routes (inspector -> preview -> confirm
 * -> undo), replacing the need to know that Team List / Player / Coach are
 * three separate imports that must run in a specific order. See
 * plan-teams-smart-auto-build.md for the full design; this is Stage 1 of
 * that plan's 4-stage lifecycle (divisions, team shells, player pool).
 */

type FileSlot = "teamList" | "playerReg" | "coachVol";

const SLOT_TO_KIND: Record<FileSlot, SportsConnectReportKind> = {
  teamList: "TEAM_LIST",
  playerReg: "PLAYER_REG",
  coachVol: "COACH_VOLUNTEER",
};

type DecoratedRun = SportsConnectImportRunView & { reportTitle: string; reportSummary: string };

type InspectorData = {
  organizationId: string;
  seasonYear: number;
  driveConfigured: boolean;
  driveFolderId: string | null;
  catalog: SportsConnectReportCatalogEntry[];
  runsByKind: Record<SportsConnectReportKind, DecoratedRun[]>;
  latestByKind: Record<SportsConnectReportKind, DecoratedRun | null>;
  degraded?: boolean;
  degradedReason?: string;
};

type PreviewSummary = { total: number; create: number; update: number; skip: number };
type TeamListSummary = PreviewSummary & { errors: number; warnings: number };

type TeamListRow = {
  rowNumber: number;
  ageGroup: string;
  teamName: string;
  action: "CREATE" | "UPDATE" | "SKIP";
  errors: string[];
  warnings: string[];
};

type PlayerPreviewRow = {
  rowNumber: number;
  ageGroup: string;
  teamName: string;
  fullName: string;
  guardianEmail: string | null;
  action: "CREATE" | "UPDATE" | "SKIP";
  reason: string | null;
  matchesTeamList: boolean | null;
};

type CoachPreviewRow = {
  rowNumber: number;
  email: string;
  name: string;
  ageGroup: string;
  action: "CREATE" | "UPDATE" | "SKIP";
  reason: string | null;
};

type FamilyCoachMatch = { email: string; coachName: string; playerNames: string[] };

type PreviewData = {
  teamList: { fileName: string; reportKindWarning: string | null; rows: TeamListRow[]; summary: TeamListSummary } | null;
  playerReg:
    | {
        fileName: string;
        reportKindWarning: string | null;
        rows: PlayerPreviewRow[];
        summary: PreviewSummary;
        missingGuardianEmailEstimate: number;
        ageGroups: { ageGroup: string; hasDraftSession: boolean }[];
      }
    | null;
  coachVol: { fileName: string; reportKindWarning: string | null; rows: CoachPreviewRow[]; summary: PreviewSummary } | null;
  familyCoachMatches: FamilyCoachMatch[];
  warnings: string[];
};

type ConfirmData = {
  teamList: { batchId: string; summary: TeamListSummary } | null;
  playerReg: {
    batchId: string;
    processed: number;
    createdTeams: number;
    createdPlayers: number;
    updatedPlayers: number;
    skipped: number;
  } | null;
  draftPool: {
    processed: number;
    createdSessions: number;
    createdEntries: number;
    updatedEntries: number;
    skipped: number;
    sessionIdsByAgeGroup: Record<string, string>;
  } | null;
  coachVol: {
    batchId: string;
    processed: number;
    created: number;
    updated: number;
    skipped: number;
    autoAssigned: number;
  } | null;
  convertedInterestCount: number;
};

type Step = "pick" | "preview" | "result";

type Props = {
  seasonYear: number;
  orgQuery: string;
  onBuildComplete?: () => void;
};

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function actionColor(action: "CREATE" | "UPDATE" | "SKIP") {
  if (action === "CREATE") return "text-emerald-300";
  if (action === "UPDATE") return "text-sky-300";
  return "text-zinc-400";
}

export default function SmartAutoBuildWizard({ seasonYear, orgQuery, onBuildComplete }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");

  const [inspector, setInspector] = useState<InspectorData | null>(null);
  const [inspectorLoading, setInspectorLoading] = useState(false);
  const [inspectorError, setInspectorError] = useState("");

  const [files, setFiles] = useState<Record<FileSlot, File | null>>({
    teamList: null,
    playerReg: null,
    coachVol: null,
  });
  const [fetchingRunId, setFetchingRunId] = useState<string | null>(null);
  const [pickError, setPickError] = useState("");

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  // Roster build method per detected age group: true = DRAFT (seeds a
  // DraftPlayerPool instead of writing TeamPlayer directly), false =
  // DIRECT_IMPORT (today's default). Defaulted from the preview response's
  // hasDraftSession flag, then editable per plan-teams-smart-auto-build.md's
  // "per-age-group, never silently assumed" design.
  const [draftAgeGroups, setDraftAgeGroups] = useState<Record<string, boolean>>({});

  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [result, setResult] = useState<ConfirmData | null>(null);

  const [undoLoading, setUndoLoading] = useState(false);
  const [undoError, setUndoError] = useState("");
  const [undone, setUndone] = useState(false);

  function resetAndClose() {
    setIsOpen(false);
    setStep("pick");
    setFiles({ teamList: null, playerReg: null, coachVol: null });
    setPreview(null);
    setPreviewError("");
    setDraftAgeGroups({});
    setResult(null);
    setConfirmError("");
    setUndoError("");
    setUndone(false);
    setPickError("");
  }

  async function openWizard() {
    setIsOpen(true);
    if (inspector) return;
    setInspectorLoading(true);
    setInspectorError("");
    try {
      const response = await fetch(
        `/api/admin/teams/smart-build/inspector?${orgQuery}&seasonYear=${seasonYear}`,
        { cache: "no-store" },
      );
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to load Drive sync status"));
      setInspector(json.data as InspectorData);
    } catch (err) {
      setInspectorError(err instanceof Error ? err.message : "Failed to load Drive sync status");
    } finally {
      setInspectorLoading(false);
    }
  }

  async function applyDriveRun(run: SportsConnectImportRunView, slot: FileSlot) {
    setFetchingRunId(run.id);
    setPickError("");
    try {
      const response = await fetch(`/api/admin/sports-connect/drive-file?${orgQuery}&runId=${run.id}`);
      if (!response.ok) {
        const json = await safeJson(response);
        throw new Error(String(json.error || "Failed to download the synced file"));
      }
      const blob = await response.blob();
      const fileName = run.sourceFileName || `synced-${run.reportKind.toLowerCase()}-${run.id}`;
      const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
      setFiles((prev) => ({ ...prev, [slot]: file }));
    } catch (err) {
      setPickError(err instanceof Error ? err.message : "Failed to use the synced file");
    } finally {
      setFetchingRunId(null);
    }
  }

  function buildFormData() {
    const fd = new FormData();
    fd.set("seasonYear", String(seasonYear));
    if (files.teamList) fd.set("teamList", files.teamList);
    if (files.playerReg) fd.set("playerReg", files.playerReg);
    if (files.coachVol) fd.set("coachVol", files.coachVol);
    const draftList = Object.entries(draftAgeGroups)
      .filter(([, isDraft]) => isDraft)
      .map(([ageGroup]) => ageGroup);
    if (draftList.length > 0) fd.set("draftAgeGroups", JSON.stringify(draftList));
    return fd;
  }

  async function runPreview() {
    if (!files.teamList && !files.playerReg && !files.coachVol) {
      setPickError("Pick at least one file — Team List, Player Registration, or Coach/Volunteer.");
      return;
    }
    setPickError("");
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const response = await fetch(`/api/admin/teams/smart-build/preview?${orgQuery}`, {
        method: "POST",
        body: buildFormData(),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to build preview"));
      const previewData = json.data as PreviewData;
      setPreview(previewData);
      setDraftAgeGroups(
        Object.fromEntries(
          (previewData.playerReg?.ageGroups ?? []).map((g) => [g.ageGroup, g.hasDraftSession]),
        ),
      );
      setStep("preview");
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to build preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runConfirm() {
    setConfirmLoading(true);
    setConfirmError("");
    try {
      const response = await fetch(`/api/admin/teams/smart-build/confirm?${orgQuery}`, {
        method: "POST",
        body: buildFormData(),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to run Smart Auto-Build"));
      setResult(json.data as ConfirmData);
      setStep("result");
      onBuildComplete?.();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Failed to run Smart Auto-Build");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function runUndo() {
    if (!result) return;
    const teamCount = result.teamList?.summary.create ?? 0;
    const playerCount = result.playerReg?.createdPlayers ?? 0;
    const coachCount = result.coachVol?.created ?? 0;
    const confirmation = window.prompt(
      `Undo this Smart Auto-Build run? This removes ${teamCount} created team(s), ${playerCount} created player(s), and ${coachCount} created coach account(s). Updated (not created) rows are left alone. Type DELETE to confirm.`,
    );
    if (confirmation !== "DELETE") return;

    setUndoLoading(true);
    setUndoError("");
    try {
      const response = await fetch(`/api/admin/teams/smart-build/undo?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamListBatchId: result.teamList?.batchId,
          playerBatchId: result.playerReg?.batchId,
          coachBatchId: result.coachVol?.batchId,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        const errors = json.errors as Record<string, string> | undefined;
        throw new Error(String(json.error || (errors && Object.values(errors)[0]) || "Failed to undo build"));
      }
      setUndone(true);
      const errors = json.errors as Record<string, string> | undefined;
      if (errors && Object.keys(errors).length > 0) {
        setUndoError(`Partially undone — ${Object.values(errors).join(" ")}`);
      }
      onBuildComplete?.();
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : "Failed to undo build");
    } finally {
      setUndoLoading(false);
    }
  }

  const catalogFor = (kind: SportsConnectReportKind) =>
    inspector?.catalog.find((entry) => entry.kind === kind) || null;

  return (
    <>
      <button
        type="button"
        onClick={() => void openWizard()}
        className="text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 font-semibold shadow"
      >
        🪄 Smart Auto-Build
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">🪄 Smart Auto-Build</h2>
                <p className="text-xs text-zinc-400">
                  Pull Team List, Player Registration, and Coach/Volunteer files from Google Drive Sync (or
                  upload them), preview everything together, then build in one click.
                </p>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>

            <WorkflowStepRowLite step={step} />

            {step === "pick" ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
                  {inspectorLoading ? (
                    <span className="text-zinc-400">Checking Google Drive Sync status…</span>
                  ) : inspectorError ? (
                    <span className="text-amber-300">{inspectorError}</span>
                  ) : inspector ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className={inspector.driveConfigured ? "text-emerald-300" : "text-amber-300"}>
                        {inspector.driveConfigured ? "✓ Google Drive Sync connected" : "⚠ Google Drive Sync not connected — upload files manually below"}
                      </span>
                      {inspector.degraded ? (
                        <span className="text-amber-300">{inspector.degradedReason}</span>
                      ) : null}
                      <span className="text-zinc-500">Season {inspector.seasonYear}</span>
                    </div>
                  ) : null}
                </div>

                {(["teamList", "playerReg", "coachVol"] as FileSlot[]).map((slot) => {
                  const kind = SLOT_TO_KIND[slot];
                  const catalogEntry = catalogFor(kind);
                  const runs = inspector?.runsByKind[kind] ?? [];
                  const file = files[slot];
                  return (
                    <div key={slot} className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-zinc-100">
                            {catalogEntry?.title || kind.replaceAll("_", " ")}
                          </p>
                          {catalogEntry ? <p className="text-[11px] text-zinc-500">{catalogEntry.summary}</p> : null}
                        </div>
                        {file ? (
                          <button
                            type="button"
                            onClick={() => setFiles((prev) => ({ ...prev, [slot]: null }))}
                            className="text-[11px] text-zinc-500 hover:text-rose-300"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <SyncedDriveFileMenu
                          runs={runs}
                          loading={inspectorLoading}
                          fetchingRunId={fetchingRunId}
                          onOpen={() => {}}
                          onSelect={(run) => void applyDriveRun(run, slot)}
                        />
                        <label className="text-xs rounded-lg border border-zinc-700 px-3 py-2 text-zinc-300 hover:bg-zinc-800 cursor-pointer">
                          Upload file
                          <input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            className="hidden"
                            onChange={(e) => {
                              const picked = e.target.files?.[0] || null;
                              setFiles((prev) => ({ ...prev, [slot]: picked }));
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {file ? (
                          <span className="text-xs text-emerald-300">✓ {file.name}</span>
                        ) : (
                          <span className="text-xs text-zinc-600">No file selected — this stage will be skipped</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {pickError ? <p className="text-xs text-rose-300">{pickError}</p> : null}
                {previewError ? <p className="text-xs text-rose-300">{previewError}</p> : null}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={previewLoading}
                    onClick={() => void runPreview()}
                    className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {previewLoading ? "Building preview…" : "Preview →"}
                  </button>
                </div>
              </div>
            ) : null}

            {step === "preview" && preview ? (
              <div className="space-y-4">
                {preview.warnings.map((w) => (
                  <p key={w} className="text-xs text-amber-300">
                    ⚠ {w}
                  </p>
                ))}

                <PreviewSection
                  title="Teams"
                  fileName={preview.teamList?.fileName}
                  reportKindWarning={preview.teamList?.reportKindWarning}
                  emptyLabel="No Team List file provided — existing teams are used as-is."
                >
                  {preview.teamList ? (
                    <>
                      <div className="grid gap-2 sm:grid-cols-4">
                        <StatusCountPill label="Create" value={preview.teamList.summary.create} valueClassName="text-xl font-semibold text-emerald-300" />
                        <StatusCountPill label="Update" value={preview.teamList.summary.update} valueClassName="text-xl font-semibold text-sky-300" />
                        <StatusCountPill label="Skip" value={preview.teamList.summary.skip} valueClassName="text-xl font-semibold text-zinc-300" />
                        <StatusCountPill label="Errors" value={preview.teamList.summary.errors} valueClassName="text-xl font-semibold text-red-300" />
                      </div>
                      <RowTable
                        rows={preview.teamList.rows}
                        columns={[
                          { label: "Action", render: (r) => <span className={actionColor(r.action)}>{r.action}</span> },
                          { label: "Age Group", render: (r) => r.ageGroup || "-" },
                          { label: "Team", render: (r) => r.teamName || "-" },
                          {
                            label: "Notes",
                            render: (r) => [...r.errors, ...r.warnings].join("; ") || "-",
                          },
                        ]}
                      />
                    </>
                  ) : null}
                </PreviewSection>

                <PreviewSection
                  title="Players"
                  fileName={preview.playerReg?.fileName}
                  reportKindWarning={preview.playerReg?.reportKindWarning}
                  emptyLabel="No Player Registration file provided."
                >
                  {preview.playerReg ? (
                    <>
                      <div className="grid gap-2 sm:grid-cols-4">
                        <StatusCountPill label="Create" value={preview.playerReg.summary.create} valueClassName="text-xl font-semibold text-emerald-300" />
                        <StatusCountPill label="Update" value={preview.playerReg.summary.update} valueClassName="text-xl font-semibold text-sky-300" />
                        <StatusCountPill label="Skip" value={preview.playerReg.summary.skip} valueClassName="text-xl font-semibold text-zinc-300" />
                        <StatusCountPill
                          label="Missing Guardian Email"
                          value={preview.playerReg.missingGuardianEmailEstimate}
                          valueClassName="text-xl font-semibold text-amber-300"
                        />
                      </div>

                      {preview.playerReg.ageGroups.length > 0 ? (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
                          <p className="text-xs font-semibold text-zinc-200">Roster build method</p>
                          <p className="text-[11px] text-zinc-500">
                            Direct Import writes these players straight onto team rosters (today&rsquo;s
                            default). Draft instead seeds a Draft Player Pool for that age group&rsquo;s
                            Online Draft — nothing is assigned to a team until the draft runs and
                            materializes.
                          </p>
                          <div className="space-y-1.5">
                            {preview.playerReg.ageGroups.map((g) => {
                              const isDraft = draftAgeGroups[g.ageGroup] ?? g.hasDraftSession;
                              return (
                                <div key={g.ageGroup} className="flex items-center justify-between gap-2 text-xs">
                                  <span className="text-zinc-300">
                                    {g.ageGroup}
                                    {g.hasDraftSession ? (
                                      <span className="ml-2 text-[10px] text-sky-300">
                                        existing draft session found
                                      </span>
                                    ) : null}
                                  </span>
                                  <div className="inline-flex rounded-lg border border-zinc-700 overflow-hidden">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDraftAgeGroups((prev) => ({ ...prev, [g.ageGroup]: false }))
                                      }
                                      className={`px-2.5 py-1 text-[11px] font-semibold ${
                                        !isDraft ? "bg-brand-purple text-white" : "text-zinc-400 hover:bg-zinc-800"
                                      }`}
                                    >
                                      Direct Import
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDraftAgeGroups((prev) => ({ ...prev, [g.ageGroup]: true }))
                                      }
                                      className={`px-2.5 py-1 text-[11px] font-semibold ${
                                        isDraft ? "bg-emerald-600 text-white" : "text-zinc-400 hover:bg-zinc-800"
                                      }`}
                                    >
                                      ⚾ Draft
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <RowTable
                        rows={preview.playerReg.rows}
                        columns={[
                          {
                            label: "Action",
                            render: (r) =>
                              r.action !== "SKIP" && draftAgeGroups[r.ageGroup] ? (
                                <span className="text-emerald-300">⚾ → Draft Pool</span>
                              ) : (
                                <span className={actionColor(r.action)}>{r.action}</span>
                              ),
                          },
                          { label: "Age Group", render: (r) => r.ageGroup || "-" },
                          { label: "Team", render: (r) => r.teamName || "-" },
                          { label: "Player", render: (r) => r.fullName || "-" },
                          {
                            label: "Team List Match",
                            render: (r) =>
                              r.matchesTeamList === null ? (
                                "-"
                              ) : r.matchesTeamList ? (
                                <span className="text-emerald-300">✓</span>
                              ) : (
                                <span className="text-amber-300">✗ no matching team</span>
                              ),
                          },
                          { label: "Notes", render: (r) => r.reason || "-" },
                        ]}
                      />
                    </>
                  ) : null}
                </PreviewSection>

                <PreviewSection
                  title="Coaches"
                  fileName={preview.coachVol?.fileName}
                  reportKindWarning={preview.coachVol?.reportKindWarning}
                  emptyLabel="No Coach/Volunteer file provided."
                >
                  {preview.coachVol ? (
                    <>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <StatusCountPill label="Create" value={preview.coachVol.summary.create} valueClassName="text-xl font-semibold text-emerald-300" />
                        <StatusCountPill label="Update" value={preview.coachVol.summary.update} valueClassName="text-xl font-semibold text-sky-300" />
                        <StatusCountPill label="Skip" value={preview.coachVol.summary.skip} valueClassName="text-xl font-semibold text-zinc-300" />
                      </div>
                      <RowTable
                        rows={preview.coachVol.rows}
                        columns={[
                          { label: "Action", render: (r) => <span className={actionColor(r.action)}>{r.action}</span> },
                          { label: "Name", render: (r) => r.name || "-" },
                          { label: "Email", render: (r) => r.email || "-" },
                          { label: "Notes", render: (r) => r.reason || "-" },
                        ]}
                      />
                    </>
                  ) : null}
                </PreviewSection>

                {preview.familyCoachMatches.length > 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3 space-y-1">
                    <p className="text-xs font-semibold text-zinc-200">
                      Coach/family email matches ({preview.familyCoachMatches.length})
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      These guardian emails also appear in the Coach/Volunteer file — useful for spotting a
                      Head Coach&rsquo;s own child before the draft&rsquo;s Protected Pick pairing step.
                    </p>
                    <ul className="text-xs text-zinc-300 space-y-0.5">
                      {preview.familyCoachMatches.map((m) => (
                        <li key={m.email}>
                          {m.coachName} ({m.email}) → {m.playerNames.join(", ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {confirmError ? <p className="text-xs text-rose-300">{confirmError}</p> : null}

                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("pick")}
                    className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    disabled={confirmLoading}
                    onClick={() => void runConfirm()}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-6 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {confirmLoading ? "Building…" : "✓ Build & Assign"}
                  </button>
                </div>
              </div>
            ) : null}

            {step === "result" && result ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-200">
                  {undone ? "This build has been undone." : "Smart Auto-Build complete."}
                </div>

                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-1">
                    <p className="text-xs font-semibold text-zinc-200">Teams</p>
                    {result.teamList ? (
                      <>
                        <p className="text-xs text-zinc-400">Created: {result.teamList.summary.create}</p>
                        <p className="text-xs text-zinc-400">Updated: {result.teamList.summary.update}</p>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-600">Not run</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-1">
                    <p className="text-xs font-semibold text-zinc-200">Players</p>
                    {result.playerReg ? (
                      <>
                        <p className="text-xs text-zinc-400">Created: {result.playerReg.createdPlayers}</p>
                        <p className="text-xs text-zinc-400">Updated: {result.playerReg.updatedPlayers}</p>
                        <p className="text-xs text-zinc-400">Skipped: {result.playerReg.skipped}</p>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-600">Not run</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-1">
                    <p className="text-xs font-semibold text-zinc-200">⚾ Draft Pool</p>
                    {result.draftPool ? (
                      <>
                        <p className="text-xs text-zinc-400">New sessions: {result.draftPool.createdSessions}</p>
                        <p className="text-xs text-zinc-400">Pool entries added: {result.draftPool.createdEntries}</p>
                        <p className="text-xs text-zinc-400">Updated: {result.draftPool.updatedEntries}</p>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-600">Not run</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-1">
                    <p className="text-xs font-semibold text-zinc-200">Coaches</p>
                    {result.coachVol ? (
                      <>
                        <p className="text-xs text-zinc-400">Created: {result.coachVol.created}</p>
                        <p className="text-xs text-zinc-400">Updated: {result.coachVol.updated}</p>
                        <p className="text-xs text-zinc-400">Auto-assigned: {result.coachVol.autoAssigned}</p>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-600">Not run</p>
                    )}
                  </div>
                </div>

                {result.convertedInterestCount > 0 ? (
                  <p className="text-xs text-zinc-400">
                    Marked {result.convertedInterestCount} coaching-interest submission(s) as converted.
                  </p>
                ) : null}

                {result.draftPool && (result.draftPool.createdEntries > 0 || result.draftPool.updatedEntries > 0) ? (
                  <p className="text-xs text-zinc-400">
                    Player pool ready for {Object.keys(result.draftPool.sessionIdsByAgeGroup).length} age
                    group(s) —{" "}
                    <a href="#online-draft" onClick={resetAndClose} className="text-emerald-300 hover:underline">
                      continue in Online Draft →
                    </a>
                  </p>
                ) : null}

                {undoError ? <p className="text-xs text-amber-300">{undoError}</p> : null}

                <div className="flex justify-between gap-2">
                  {!undone ? (
                    <button
                      type="button"
                      disabled={undoLoading}
                      onClick={() => void runUndo()}
                      className="rounded-lg border border-rose-700 text-rose-300 px-4 py-2 text-sm font-semibold hover:bg-rose-950/30 disabled:opacity-60"
                    >
                      {undoLoading ? "Undoing…" : "Undo This Build"}
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function WorkflowStepRowLite({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "pick", label: "Pick Files" },
    { id: "preview", label: "Preview" },
    { id: "result", label: "Build" },
  ];
  const currentIndex = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      {steps.map((s, index) => (
        <div key={s.id} className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2 py-1 ${
              index === currentIndex
                ? "border-brand-purple bg-brand-purple/15 text-brand-purple"
                : index < currentIndex
                  ? "border-emerald-700 bg-emerald-950/25 text-emerald-300"
                  : "border-zinc-700 text-zinc-400"
            }`}
          >
            {index + 1}. {s.label}
          </span>
          {index < steps.length - 1 ? <span className="text-zinc-600">/</span> : null}
        </div>
      ))}
    </div>
  );
}

function PreviewSection({
  title,
  fileName,
  reportKindWarning,
  emptyLabel,
  children,
}: {
  title: string;
  fileName: string | null | undefined;
  reportKindWarning: string | null | undefined;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        {fileName ? <p className="text-[11px] text-zinc-500">{fileName}</p> : null}
      </div>
      {reportKindWarning ? <p className="text-xs text-amber-300">⚠ {reportKindWarning}</p> : null}
      {fileName ? children : <p className="text-xs text-zinc-600">{emptyLabel}</p>}
    </div>
  );
}

const ROW_TABLE_LIMIT = 25;

function RowTable<T extends { rowNumber: number }>({
  rows,
  columns,
}: {
  rows: T[];
  columns: { label: string; render: (row: T) => React.ReactNode }[];
}) {
  const shown = rows.slice(0, ROW_TABLE_LIMIT);
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-zinc-800">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-zinc-900 text-zinc-300">
          <tr className="text-left">
            <th className="px-3 py-2">Row</th>
            {columns.map((col) => (
              <th key={col.label} className="px-3 py-2">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.rowNumber} className="border-t border-zinc-800 align-top">
              <td className="px-3 py-2 text-zinc-500">{row.rowNumber}</td>
              {columns.map((col) => (
                <td key={col.label} className="px-3 py-2">
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > ROW_TABLE_LIMIT ? (
        <p className="px-3 py-2 text-[11px] text-zinc-500 border-t border-zinc-800">
          +{rows.length - ROW_TABLE_LIMIT} more row(s) not shown.
        </p>
      ) : null}
    </div>
  );
}
