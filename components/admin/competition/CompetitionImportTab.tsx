"use client";

import { useCallback, useEffect, useState } from "react";

import { SportsConnectQualityPanel } from "@/components/admin/teams/SportsConnectAssistPanels";
import PlayerNameCollisionsPanel from "@/components/admin/teams/PlayerNameCollisionsPanel";
import SmartAutoBuildWizard from "@/components/admin/teams/SmartAutoBuildWizard";
import FallBallCapacityCard from "@/components/admin/FallBallCapacityCard";
import type { RosterQualitySummary, SportsConnectImportRunView } from "@/lib/sportsConnect/types";
import type { ContentOrgId } from "@/lib/siteConfig";

function reportKindLabel(kind: string) {
  return kind.replaceAll("_", " ");
}

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * The single, primary destination for getting SportsConnect data into the
 * platform. Replaces the old "SportsConnect Import" Ops Desk, which never
 * wrote to the database itself — every actionable item there was a dead-end
 * link back to Teams. SmartAutoBuildWizard (the modern unified 3-report-type
 * import flow) is mounted directly here instead; the legacy manual
 * team-list/player/coach modals remain reachable from Teams & Rosters'
 * "Advanced / Legacy" disclosure for edge cases the wizard doesn't cover.
 */
export default function CompetitionImportTab({
  targetOrg,
  seasonYear: initialSeasonYear = new Date().getFullYear(),
  onViewEnrollment,
}: {
  targetOrg: ContentOrgId;
  seasonYear?: number;
  onViewEnrollment?: () => void;
}) {
  const orgQuery = `org=${targetOrg}`;
  const [seasonYear, setSeasonYear] = useState(initialSeasonYear);
  const [quality, setQuality] = useState<RosterQualitySummary | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityError, setQualityError] = useState("");
  const [runs, setRuns] = useState<SportsConnectImportRunView[]>([]);
  const [runsError, setRunsError] = useState("");

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
        json.data && typeof json.data === "object" ? (json.data as RosterQualitySummary) : null,
      );
    } catch (err: unknown) {
      setQuality(null);
      setQualityError(err instanceof Error ? err.message : "Failed to load quality");
    } finally {
      setQualityLoading(false);
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
      setRuns(Array.isArray(json.data) ? (json.data as SportsConnectImportRunView[]) : []);
    } catch (err: unknown) {
      setRuns([]);
      setRunsError(err instanceof Error ? err.message : "Failed to load runs");
    }
  }, [orgQuery, seasonYear]);

  const [driveFolderIdInput, setDriveFolderIdInput] = useState("");
  const [driveConfigured, setDriveConfigured] = useState(false);
  const [driveSyncing, setDriveSyncing] = useState(false);
  const [driveSyncResult, setDriveSyncResult] = useState<string | null>(null);
  const [driveDegraded, setDriveDegraded] = useState(false);
  const [driveDegradedReason, setDriveDegradedReason] = useState<string | null>(null);
  const [driveProvisioning, setDriveProvisioning] = useState(false);

  const loadDriveSync = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/sports-connect/drive-sync?${orgQuery}`, {
        cache: "no-store",
      });
      const json = await safeJson(res);
      if (res.ok && json.data && typeof json.data === "object") {
        const data = json.data as {
          configured: boolean;
          driveFolderId: string | null;
          degraded?: boolean;
          degradedReason?: string;
        };
        setDriveConfigured(data.configured);
        if (data.driveFolderId) {
          setDriveFolderIdInput(data.driveFolderId);
        }
        setDriveDegraded(Boolean(data.degraded));
        setDriveDegradedReason(data.degradedReason ?? null);
      }
    } catch {
      // ignore
    }
  }, [orgQuery]);

  const runDbMigration = async () => {
    setDriveProvisioning(true);
    setDriveSyncResult(null);
    try {
      const res = await fetch("/api/admin/sports-connect/drive-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: targetOrg, provisionOnly: true }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        throw new Error(String(json.error || "Schema provisioning failed"));
      }
      setDriveSyncResult("Database schema provisioned successfully. Refreshing status…");
      await loadDriveSync();
    } catch (err) {
      setDriveSyncResult(err instanceof Error ? err.message : "Schema provisioning failed");
    } finally {
      setDriveProvisioning(false);
    }
  };

  const triggerDriveSync = async () => {
    setDriveSyncing(true);
    setDriveSyncResult(null);
    try {
      const res = await fetch("/api/admin/sports-connect/drive-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: targetOrg,
          driveFolderId: driveFolderIdInput,
          seasonYear,
        }),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        throw new Error(String(json.error || "Drive sync failed"));
      }
      const syncResult = (
        json.data as {
          syncResult?: { filesProcessed: number; filesFound: number; filesQuarantined: number };
        }
      )?.syncResult;
      setDriveSyncResult(
        `Sync completed: ${syncResult?.filesProcessed ?? 0} files processed out of ${syncResult?.filesFound ?? 0} found (${syncResult?.filesQuarantined ?? 0} quarantined).`,
      );
      setDriveConfigured(true);
      void loadRuns();
    } catch (err) {
      setDriveSyncResult(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setDriveSyncing(false);
    }
  };

  useEffect(() => {
    function load() {
      void loadQuality();
      void loadRuns();
      void loadDriveSync();
    }
    load();
  }, [loadQuality, loadRuns, loadDriveSync]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Registration import
            </p>
            <h2 className="text-lg font-semibold">Import from SportsConnect</h2>
            <p className="text-xs text-zinc-400 mt-1">
              SportsConnect stays the registration source of record; the Enrollment
              ledger here is built from what you import. Site{" "}
              <span className="text-zinc-200 font-medium">{targetOrg}</span>, season{" "}
              {seasonYear}.
            </p>
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
            {onViewEnrollment ? (
              <button
                type="button"
                onClick={onViewEnrollment}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
              >
                View Enrollment &amp; KPIs →
              </button>
            ) : null}
          </div>
        </div>

        <SmartAutoBuildWizard
          seasonYear={seasonYear}
          orgQuery={orgQuery}
          autoOpen
          onBuildComplete={() => {
            void loadQuality();
            void loadRuns();
          }}
        />

        <p className="text-[11px] text-zinc-500">
          Need to import just one file type manually, or something the wizard doesn&apos;t
          cover? Use the{" "}
          <a className="text-brand-purple hover:underline" href="#teams-build">
            Advanced / Legacy import
          </a>{" "}
          section on the Teams &amp; Rosters tab.
        </p>
      </div>

      {targetOrg === "fallball" && (
        <div>
          <FallBallCapacityCard />
        </div>
      )}

      <div id="sports-connect-quality">
        <SportsConnectQualityPanel
          quality={quality}
          loading={qualityLoading}
          error={qualityError}
          onRefresh={() => void loadQuality()}
        />
      </div>

      <PlayerNameCollisionsPanel orgQuery={orgQuery} seasonYear={seasonYear} />

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Google Drive Automated Ingestion</h3>
            <p className="text-xs text-zinc-400">
              Configure your organization&apos;s Google Drive export folder ID for SportsConnect reports.
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              driveConfigured
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                : "bg-amber-950 text-amber-400 border border-amber-800"
            }`}
          >
            {driveConfigured ? "Folder Mapped" : "Not Mapped"}
          </span>
        </div>

        {driveDegraded ? (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 space-y-2.5">
            <p className="text-xs font-semibold text-amber-200">
              Drive sync database schema not provisioned
            </p>
            <p className="text-xs text-amber-200/80">
              {driveDegradedReason ?? "Drive sync status is temporarily unavailable."}
            </p>
            <button
              type="button"
              onClick={() => void runDbMigration()}
              disabled={driveProvisioning}
              className="rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
            >
              {driveProvisioning ? "Running migration…" : "Run DB Migration"}
            </button>
          </div>
        ) : null}

        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
          <label className="block space-y-1">
            <span className="text-xs text-zinc-300 font-medium">Google Drive Folder ID</span>
            <input
              type="text"
              value={driveFolderIdInput}
              onChange={(e) => setDriveFolderIdInput(e.target.value)}
              placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j"
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs font-mono text-zinc-200"
            />
            <p className="text-[11px] text-zinc-500">
              The Google Drive folder ID where SportsConnect CSV reports are exported for site{" "}
              <span className="text-zinc-300 font-semibold">{targetOrg}</span>.
            </p>
          </label>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void triggerDriveSync()}
              disabled={driveSyncing || !driveFolderIdInput.trim()}
              className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
            >
              {driveSyncing ? "Syncing Google Drive…" : "Sync Drive Files Now"}
            </button>
          </div>

          {driveSyncResult ? (
            <p className="text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 rounded-md p-2.5">
              {driveSyncResult}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3.5 text-xs text-zinc-400 space-y-1.5">
          <p className="font-semibold text-zinc-300">How Drive Sync Works:</p>
          <ul className="list-disc list-inside space-y-1 text-zinc-400">
            <li>Vercel Cron automatically polls this folder every 2 hours.</li>
            <li>Only modified files (new revision token) are processed.</li>
            <li>
              Files exceeding 10,000 rows or with invalid headers are quarantined safely
              without erroring background cron runs.
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Detection &amp; preview audit</h3>
            <p className="text-xs text-zinc-400">
              Every detected/previewed SportsConnect file for this site and season. For
              actual write-job history with undo, see Teams &amp; Rosters → Import History.
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
        {runsError ? <p className="text-sm text-amber-300">{runsError}</p> : null}
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
                    <td className="px-3 py-2">{new Date(run.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{reportKindLabel(run.reportKind)}</td>
                    <td className="px-3 py-2">{run.status}</td>
                    <td className="px-3 py-2">{run.sourceFileName || "—"}</td>
                    <td className="px-3 py-2 text-zinc-400">
                      {run.teamPlayerBatchId ? `player batch ${run.teamPlayerBatchId.slice(0, 8)}…` : ""}
                      {run.coachBatchId
                        ? `${run.teamPlayerBatchId ? " · " : ""}coach ${run.coachBatchId.slice(0, 8)}…`
                        : ""}
                      {run.errorMessage
                        ? ` · ${run.errorMessage}`
                        : !run.teamPlayerBatchId && !run.coachBatchId
                          ? run.summary && typeof run.summary.message === "string"
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
      </div>
    </div>
  );
}
