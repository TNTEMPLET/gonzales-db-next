"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { parseGameChangerEmbedSnippet } from "@/lib/gamechanger/parseEmbedSnippet";
import type {
  UnifiedGameChangerConnection,
  UnifiedScoreGame,
  UnifiedScoreSourceType,
} from "@/lib/admin/unifiedScoreSources";

type SourceTarget = {
  sourceType: UnifiedScoreSourceType;
  organizationId: string;
  organizationLabel: string;
  seasonYear: number;
  sourceKey: string;
  sourceLabel: string;
  ageDivisionLabel: string;
};

type PreviewRow = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  gameLabel: string;
  eventStatus?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  outcome: string;
};

function sourceKey(
  target: Pick<SourceTarget, "sourceType" | "organizationId" | "seasonYear" | "sourceKey">,
) {
  return `${target.sourceType}:${target.organizationId}:${target.seasonYear}:${target.sourceKey}`;
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function GameChangerPanel({
  games,
  connections,
}: {
  games: UnifiedScoreGame[];
  connections: UnifiedGameChangerConnection[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [widgetIdDraft, setWidgetIdDraft] = useState("");
  const [embedSnippet, setEmbedSnippet] = useState("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const sourceTargets = useMemo(() => {
    const seen = new Set<string>();
    return games.flatMap((game) => {
      const target: SourceTarget = {
        sourceType: game.sourceType,
        organizationId: game.organizationId,
        organizationLabel: game.organizationLabel,
        seasonYear: game.seasonYear,
        sourceKey: game.sourceKey,
        sourceLabel: game.sourceLabel,
        ageDivisionLabel: "All league divisions",
      };
      const key = sourceKey(target);
      if (seen.has(key)) return [];
      seen.add(key);
      return [target];
    });
  }, [games]);

  const target = sourceTargets.find((item) => sourceKey(item) === selectedTargetKey) ?? sourceTargets[0];
  const connectionByTarget = useMemo(
    () => new Map(connections.map((connection) => [sourceKey(connection), connection])),
    [connections],
  );
  const targetConnection = target ? connectionByTarget.get(sourceKey(target)) : undefined;
  const gcCount = games.filter((game) => game.hasGameChanger).length;

  function applyEmbedSnippet() {
    const result = parseGameChangerEmbedSnippet(embedSnippet);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setWidgetIdDraft(result.config.widgetId);
    setNotice("Parsed the GameChanger widget ID. Save the connection to use it here.");
    setError("");
  }

  async function saveGameChanger() {
    if (!target) return;
    const widgetId = widgetIdDraft.trim() || targetConnection?.widgetId || "";
    if (!widgetId) {
      setError("Enter a GameChanger widget ID first.");
      return;
    }
    setBusyKey("gc-save");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/scores/gamechanger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...target, widgetId, autoImportFinalScores: true }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(String(json.error || "Failed to save GameChanger connection"));
      setNotice(`Connected GameChanger to ${target.sourceLabel}.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save GameChanger connection");
    } finally {
      setBusyKey("");
    }
  }

  async function previewGameChanger() {
    if (!target) return;
    setBusyKey("gc-preview");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/scores/gamechanger/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(String(json.error || "Failed to preview GameChanger scores"));
      setPreviewRows(json.rows ?? []);
      setNotice(
        `Found ${(json.rows ?? []).filter((row: PreviewRow) => row.outcome === "completed").length} completed GameChanger games.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview GameChanger scores");
    } finally {
      setBusyKey("");
    }
  }

  async function importGameChanger() {
    if (!target) return;
    setBusyKey("gc-import");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/scores/gamechanger/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(String(json.error || "Failed to import GameChanger scores"));
      setPreviewRows(json.rows ?? []);
      setNotice(`Imported ${json.importedCount ?? 0} completed GameChanger scores.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import GameChanger scores");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">GameChanger</p>
        <h2 className="mt-1 text-2xl font-bold">Connect a league scoreboard</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          {gcCount} loaded games currently have GameChanger connected. Paste a widget ID, preview finals, then import.
        </p>
      </div>

      {(notice || error) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-red-500/40 bg-red-950/40 text-red-100"
              : "border-emerald-500/40 bg-emerald-950/40 text-emerald-100"
          }`}
        >
          {error || notice}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void previewGameChanger()}
          disabled={!target || busyKey === "gc-preview"}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-brand-gold disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => void importGameChanger()}
          disabled={!target || busyKey === "gc-import"}
          className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-50"
        >
          Import finals
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto]">
        <label className="text-sm text-zinc-300">
          League
          <select
            value={target ? sourceKey(target) : ""}
            onChange={(event) => {
              setSelectedTargetKey(event.target.value);
              setPreviewRows([]);
            }}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          >
            {sourceTargets.map((item) => (
              <option key={sourceKey(item)} value={sourceKey(item)}>
                {item.sourceLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-300">
          Widget ID
          <input
            value={widgetIdDraft || targetConnection?.widgetId || ""}
            onChange={(event) => setWidgetIdDraft(event.target.value)}
            placeholder="GameChanger widget UUID"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
        <button
          type="button"
          onClick={() => void saveGameChanger()}
          disabled={!target || busyKey === "gc-save"}
          className="self-end rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Save connection
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <textarea
          value={embedSnippet}
          onChange={(event) => setEmbedSnippet(event.target.value)}
          rows={2}
          placeholder="Optional: paste the GameChanger embed snippet to extract the widget ID"
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={applyEmbedSnippet}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-brand-gold"
        >
          Parse snippet
        </button>
      </div>

      {previewRows.length > 0 ? (
        <div className="max-h-64 overflow-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Game</th>
                <th className="px-3 py-2 text-left">Match</th>
                <th className="px-3 py-2 text-left">GC status</th>
                <th className="px-3 py-2 text-left">Score</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.slice(0, 40).map((row) => (
                <tr key={row.matchId} className="border-t border-zinc-800">
                  <td className="px-3 py-2">{row.gameLabel}</td>
                  <td className="px-3 py-2">
                    {row.homeTeam} vs {row.awayTeam}
                  </td>
                  <td className="px-3 py-2">{row.outcome}</td>
                  <td className="px-3 py-2">
                    {row.homeScore ?? "-"} - {row.awayScore ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
