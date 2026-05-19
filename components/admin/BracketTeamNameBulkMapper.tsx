"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import BracketTeamNameMappingEditor, {
  type TeamNameSourcesPayload,
} from "@/components/admin/BracketTeamNameMappingEditor";
import { parseBracketSpec, type BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { teamLabelRenamesFromDraft } from "@/lib/tournament-brackets/bracketTeamRename";

type BulkRow = TeamNameSourcesPayload & {
  projectId: string;
  projectName: string;
  status: string;
  seasonYear: number;
  error?: string;
};

type Props = {
  organizationId: string;
  seasonYear?: number;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onProjectUpdated: (projectId: string) => void;
};

function draftFromRow(row: BulkRow): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const label of row.bracketLabels) draft[label] = label;
  for (const { from, to } of row.suggestedMappings) {
    if (draft[from] !== undefined) draft[from] = to;
  }
  return draft;
}

export default function BracketTeamNameBulkMapper({
  organizationId,
  seasonYear,
  busy,
  onBusyChange,
  onNotice,
  onError,
  onProjectUpdated,
}: Props) {
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSpec, setExpandedSpec] = useState<BracketSpec | null>(null);
  const [draftByProject, setDraftByProject] = useState<Record<string, Record<string, string>>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const url = new URL("/api/admin/tournament-brackets/team-name-mapping", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      if (seasonYear != null) url.searchParams.set("seasonYear", String(seasonYear));
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json()) as { data?: BulkRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed to load brackets (${res.status})`);
      const data = json.data ?? [];
      setRows(data);
      setDraftByProject((prev) => {
        const next: Record<string, Record<string, string>> = {};
        for (const row of data) {
          if (row.bracketLabels.length === 0) continue;
          next[row.projectId] = prev[row.projectId] ?? draftFromRow(row);
        }
        return next;
      });
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, seasonYear]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!expandedId) {
      setExpandedSpec(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/tournament-brackets/projects/${expandedId}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { data?: { spec?: unknown } };
        if (!res.ok || cancelled) return;
        setExpandedSpec(parseBracketSpec(json.data?.spec));
      } catch {
        if (!cancelled) setExpandedSpec(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedId]);

  const rowsWithTeams = useMemo(
    () => (rows ?? []).filter((r) => r.bracketLabels.length > 0 && !r.error),
    [rows],
  );

  const totalPendingRenames = useMemo(() => {
    let count = 0;
    for (const row of rowsWithTeams) {
      const draft = draftByProject[row.projectId] ?? draftFromRow(row);
      count += teamLabelRenamesFromDraft(row.bracketLabels, draft).length;
    }
    return count;
  }, [rowsWithTeams, draftByProject]);

  function applyAllSuggestions() {
    const next: Record<string, Record<string, string>> = {};
    for (const row of rowsWithTeams) {
      next[row.projectId] = draftFromRow(row);
    }
    setDraftByProject(next);
  }

  async function saveAllPending() {
    if (totalPendingRenames === 0) return;
    onBusyChange(true);
    onError("");
    try {
      const updates: { projectId: string; renames: { from: string; to: string }[] }[] = [];
      for (const row of rowsWithTeams) {
        const draft = draftByProject[row.projectId] ?? draftFromRow(row);
        const renames = teamLabelRenamesFromDraft(row.bracketLabels, draft);
        if (renames.length > 0) updates.push({ projectId: row.projectId, renames });
      }
      if (updates.length === 0) return;

      const res = await fetch("/api/admin/tournament-brackets/team-name-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        results?: { projectId: string; ok: boolean; error?: string; renamedCount: number }[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`);

      const failed = (json.results ?? []).filter((r) => !r.ok);
      if (failed.length > 0) {
        throw new Error(failed.map((f) => `${f.projectId}: ${f.error ?? "failed"}`).join("; "));
      }

      const renamed = (json.results ?? []).reduce((sum, r) => sum + (r.renamedCount ?? 0), 0);
      onNotice(`Updated team names on ${updates.length} bracket(s) (${renamed} rename(s)).`);
      await loadAll();
      for (const u of updates) onProjectUpdated(u.projectId);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onBusyChange(false);
    }
  }

  if (loading && !rows) {
    return <p className="text-xs text-zinc-500">Loading all brackets and GameChanger rosters…</p>;
  }

  if (loadError && !rows) {
    return (
      <p className="text-xs text-amber-300">
        {loadError}{" "}
        <button type="button" className="underline" onClick={() => void loadAll()}>
          Retry
        </button>
      </p>
    );
  }

  if (!rows || rows.length === 0) {
    return <p className="text-xs text-zinc-500">No draft or published brackets found for this organization.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-zinc-500">
        Review every bracket for this organization
        {seasonYear != null ? ` (${seasonYear})` : ""}. Names are pulled from each bracket and its GameChanger
        scoreboard when configured. Expand a bracket to edit mappings, or save all pending changes at once.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || loading}
          className="rounded border border-violet-700/60 bg-violet-950/40 px-2 py-1 text-[11px] font-semibold text-violet-100 hover:bg-violet-900/50 disabled:opacity-40"
          onClick={applyAllSuggestions}
        >
          Apply all suggestions (every bracket)
        </button>
        <button
          type="button"
          disabled={busy || loading || totalPendingRenames === 0}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
          onClick={() => void saveAllPending()}
        >
          Save all pending ({totalPendingRenames})
        </button>
        <button
          type="button"
          disabled={busy || loading}
          className="rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
          onClick={() => void loadAll()}
        >
          Refresh
        </button>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const hasLabels = row.bracketLabels.length > 0;
          const draft = draftByProject[row.projectId] ?? (hasLabels ? draftFromRow(row) : {});
          const pending = hasLabels ? teamLabelRenamesFromDraft(row.bracketLabels, draft) : [];
          const expanded = expandedId === row.projectId;

          return (
            <li key={row.projectId} className="rounded-lg border border-zinc-800 bg-zinc-950/40">
              <button
                type="button"
                disabled={!hasLabels || Boolean(row.error)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm disabled:opacity-40"
                onClick={() => setExpandedId(expanded ? null : row.projectId)}
              >
                <span className="min-w-0 truncate font-medium text-zinc-200">
                  {row.projectName}{" "}
                  <span className="font-normal text-zinc-500">
                    ({row.seasonYear} · {row.status})
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-zinc-500">
                  {row.error
                    ? "Invalid spec"
                    : hasLabels
                      ? `${row.bracketLabels.length} teams · ${pending.length} pending`
                      : "No teams"}
                </span>
              </button>
              {expanded && hasLabels && !row.error && expandedSpec ? (
                <div className="border-t border-zinc-800 p-3">
                  <BracketTeamNameMappingEditor
                    spec={expandedSpec}
                    projectId={row.projectId}
                    busy={busy}
                    sources={row}
                    sourcesLoading={false}
                    draftByOriginal={draft}
                    onDraftChange={(next) =>
                      setDraftByProject((prev) => ({ ...prev, [row.projectId]: next }))
                    }
                    onReloadSources={() => void loadAll()}
                    onSave={async () => {
                      onBusyChange(true);
                      onError("");
                      try {
                        const renames = teamLabelRenamesFromDraft(row.bracketLabels, draft);
                        const res = await fetch("/api/admin/tournament-brackets/team-name-mapping", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            updates: [{ projectId: row.projectId, renames }],
                          }),
                        });
                        const json = (await res.json()) as {
                          results?: { ok: boolean; error?: string }[];
                          error?: string;
                        };
                        if (!res.ok) throw new Error(json.error ?? "Save failed");
                        if (!json.results?.[0]?.ok) {
                          throw new Error(json.results?.[0]?.error ?? "Save failed");
                        }
                        onNotice(`Team names updated for “${row.projectName}”.`);
                        onProjectUpdated(row.projectId);
                        await loadAll();
                      } catch (err: unknown) {
                        onError(err instanceof Error ? err.message : String(err));
                      } finally {
                        onBusyChange(false);
                      }
                    }}
                  />
                </div>
              ) : expanded && hasLabels && !row.error ? (
                <p className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500">Loading bracket…</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
