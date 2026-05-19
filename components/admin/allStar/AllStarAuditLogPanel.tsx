"use client";

import { useCallback, useEffect, useState } from "react";

import { formatAllStarAuditActionLabel } from "@/lib/allStar/auditLogLabels";

type AuditLogRow = {
  id: string;
  action: string;
  summary: string;
  actorEmail: string;
  createdAt: string;
  revertedAt: string | null;
  canRevert: boolean;
  ballotCycleId: string | null;
};

type AuditMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type AllStarAuditLogPanelProps = {
  org: "gonzales" | "ascension";
  cycleId?: string | null;
  onReverted?: () => void;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AllStarAuditLogPanel({
  org,
  cycleId,
  onReverted,
}: AllStarAuditLogPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [meta, setMeta] = useState<AuditMeta>({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filterByCycle, setFilterByCycle] = useState(Boolean(cycleId));

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        org,
        page: String(page),
        pageSize: "25",
      });
      if (filterByCycle && cycleId) {
        params.set("cycleId", cycleId);
      }
      const response = await fetch(`/api/admin/all-star/audit-log?${params.toString()}`);
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to load change log");
      }
      setLogs(json.data ?? []);
      setMeta(json.meta ?? { page: 1, pageSize: 25, total: 0, totalPages: 1 });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load change log");
    } finally {
      setLoading(false);
    }
  }, [org, page, cycleId, filterByCycle]);

  useEffect(() => {
    if (!expanded) return;
    void loadLogs();
  }, [expanded, loadLogs]);

  async function revertEntry(logId: string, summary: string) {
    if (
      !window.confirm(
        `Revert this change?\n\n${summary}\n\nThis restores the previous state for this action.`,
      )
    ) {
      return;
    }
    setBusyId(logId);
    setError("");
    try {
      const response = await fetch("/api/admin/all-star/audit-log/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, org }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to revert change");
      }
      onReverted?.();
      await loadLogs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revert change");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-amber-800/50 bg-amber-950/20">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-lg font-semibold text-amber-100">Change log</h2>
          <p className="text-xs text-amber-200/70 mt-0.5">
            Master Admin only — review vault changes and undo supported actions.
          </p>
        </div>
        <span className="text-xs text-amber-300 shrink-0">{expanded ? "Hide" : "Show"}</span>
      </button>

      {expanded ? (
        <div className="border-t border-amber-800/40 px-5 pb-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {cycleId ? (
              <label className="inline-flex items-center gap-2 text-amber-100/90">
                <input
                  type="checkbox"
                  checked={filterByCycle}
                  onChange={(e) => {
                    setFilterByCycle(e.target.checked);
                    setPage(1);
                  }}
                  className="rounded border-amber-700"
                />
                Only this ballot
              </label>
            ) : null}
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadLogs()}
              className="rounded-lg border border-amber-700/60 px-3 py-1.5 text-amber-100 hover:bg-amber-900/40 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          {loading && logs.length === 0 ? (
            <p className="text-sm text-amber-200/70">Loading…</p>
          ) : null}

          {!loading && logs.length === 0 ? (
            <p className="text-sm text-amber-200/70">No changes recorded yet.</p>
          ) : null}

          {logs.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-amber-900/50">
              <table className="w-full text-sm text-left">
                <thead className="bg-amber-950/60 text-xs uppercase tracking-wide text-amber-200/80">
                  <tr>
                    <th className="px-3 py-2 font-semibold">When</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                    <th className="px-3 py-2 font-semibold">Summary</th>
                    <th className="px-3 py-2 font-semibold">By</th>
                    <th className="px-3 py-2 font-semibold text-right">Undo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-900/40">
                  {logs.map((log) => (
                    <tr key={log.id} className="text-amber-50/90 hover:bg-amber-950/30">
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-amber-200/80">
                        {formatWhen(log.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {formatAllStarAuditActionLabel(log.action)}
                      </td>
                      <td className="px-3 py-2 min-w-[12rem]">
                        <span className={log.revertedAt ? "line-through text-amber-200/50" : ""}>
                          {log.summary}
                        </span>
                        {log.revertedAt ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-300">
                            Reverted
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-amber-200/70">{log.actorEmail}</td>
                      <td className="px-3 py-2 text-right">
                        {log.canRevert ? (
                          <button
                            type="button"
                            disabled={busyId === log.id}
                            onClick={() => void revertEntry(log.id, log.summary)}
                            className="rounded border border-amber-600/70 px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/50 disabled:opacity-50"
                          >
                            {busyId === log.id ? "…" : "Revert"}
                          </button>
                        ) : (
                          <span className="text-[10px] text-amber-300/40">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {meta.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 text-xs text-amber-200/80">
              <span>
                Page {meta.page} of {meta.totalPages} ({meta.total} entries)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-amber-700/60 px-2 py-1 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= meta.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-amber-700/60 px-2 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
