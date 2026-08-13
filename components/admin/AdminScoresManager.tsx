"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { assignrScopeLabel, type AdminAssignrScope } from "@/lib/admin/assignrScopeShared";
import { parseGameChangerEmbedSnippet } from "@/lib/gamechanger/parseEmbedSnippet";
import type { UnifiedGameChangerConnection, UnifiedScoreGame, UnifiedScoreSourceType } from "@/lib/admin/unifiedScoreSources";

type Props = {
  targetOrg?: string;
  games?: UnifiedScoreGame[];
  connections?: UnifiedGameChangerConnection[];
  scope?: AdminAssignrScope;
  seasonYear?: number;
  /** When true (Scores hub GameChanger section), open the GC service panel by default. */
  preferGameChangerExpanded?: boolean;
};
type ScoreDraft = Record<string, { homeScore: string; awayScore: string }>;
type SourceTarget = { sourceType: UnifiedScoreSourceType; organizationId: string; organizationLabel: string; seasonYear: number; sourceKey: string; sourceLabel: string; ageDivisionLabel: string; projectId?: string };
type PreviewRow = { matchId: string; homeTeam: string; awayTeam: string; gameLabel: string; eventStatus?: string; homeScore?: number | null; awayScore?: number | null; outcome: string };
async function readJson(response: Response) { return response.json().catch(() => ({})); }
function sourceKey(target: Pick<SourceTarget, "sourceType" | "organizationId" | "seasonYear" | "sourceKey">) { return `${target.sourceType}:${target.organizationId}:${target.seasonYear}:${target.sourceKey}`; }
function sourceOptionLabel(target: SourceTarget) {
  if (target.sourceType === "LEAGUE") return target.ageDivisionLabel;
  return target.sourceLabel.includes(target.ageDivisionLabel) ? target.sourceLabel : `${target.ageDivisionLabel} · ${target.sourceLabel}`;
}
function formatScore(game: UnifiedScoreGame) { return game.scored ? `${game.homeScore ?? "-"} - ${game.awayScore ?? "-"}` : "Missing"; }
function badgeClass(sourceType: UnifiedScoreSourceType) { return sourceType === "LEAGUE" ? "border-blue-500/40 bg-blue-950/40 text-blue-100" : "border-amber-500/40 bg-amber-950/40 text-amber-100"; }

function dateKeyFromValue(value: string | null | undefined) { return value?.trim().slice(0, 10) ?? ""; }
function todayDateKey() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}
function dateOptionLabel(key: string, fallback?: string) {
  const today = todayDateKey();
  return key === today ? `Today (${fallback || key})` : fallback || key;
}

export default function AdminScoresManager({
  targetOrg,
  games = [],
  connections = [],
  scope = (targetOrg as AdminAssignrScope) || "all",
  seasonYear = new Date().getFullYear(),
  preferGameChangerExpanded = false,
}: Props) {
  const router = useRouter();
  const initialDraft = useMemo(() => Object.fromEntries(games.map((g) => [g.id, { homeScore: g.homeScore == null ? "" : String(g.homeScore), awayScore: g.awayScore == null ? "" : String(g.awayScore) }])) as ScoreDraft, [games]);
  const [drafts, setDrafts] = useState<ScoreDraft>(initialDraft);
  const [sourceFilter, setSourceFilter] = useState<"ALL" | UnifiedScoreSourceType>("ALL");
  const [orgFilter, setOrgFilter] = useState("ALL");
  const [ageFilter, setAgeFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState(() => todayDateKey());
  const [gameChangerExpanded, setGameChangerExpanded] = useState(preferGameChangerExpanded);
  useEffect(() => {
    setGameChangerExpanded(preferGameChangerExpanded);
  }, [preferGameChangerExpanded]);
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedTargetSite, setSelectedTargetSite] = useState("");
  const [selectedTargetSeason, setSelectedTargetSeason] = useState("");
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [widgetIdDraft, setWidgetIdDraft] = useState("");
  const [embedSnippet, setEmbedSnippet] = useState("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  const sourceTargets = useMemo(() => {
    const seen = new Set<string>();
    return games.flatMap((game) => {
      const target: SourceTarget = { sourceType: game.sourceType, organizationId: game.organizationId, organizationLabel: game.organizationLabel, seasonYear: game.seasonYear, sourceKey: game.sourceKey, sourceLabel: game.sourceLabel, ageDivisionLabel: game.sourceType === "LEAGUE" ? "All league divisions" : game.ageGroup, projectId: game.projectId };
      const key = sourceKey(target); if (seen.has(key)) return []; seen.add(key); return [target];
    });
  }, [games]);
  const targetSiteOptions = Array.from(new Map(sourceTargets.map((item) => [item.organizationId, item.organizationLabel])).entries());
  const activeTargetSite = selectedTargetSite || targetSiteOptions[0]?.[0] || "";
  const targetSeasonOptions = Array.from(new Set(sourceTargets.filter((item) => item.organizationId === activeTargetSite).map((item) => item.seasonYear))).sort((a, b) => b - a);
  const activeTargetSeason = selectedTargetSeason || (targetSeasonOptions[0] == null ? "" : String(targetSeasonOptions[0]));
  const filteredSourceTargets = sourceTargets.filter((item) => item.organizationId === activeTargetSite && String(item.seasonYear) === activeTargetSeason);
  const target = filteredSourceTargets.find((item) => sourceKey(item) === selectedTargetKey) ?? filteredSourceTargets[0] ?? sourceTargets[0];
  const connectionByTarget = useMemo(() => new Map(connections.map((c) => [sourceKey(c), c])), [connections]);
  const targetConnection = target ? connectionByTarget.get(sourceKey(target)) : undefined;
  const visibleGames = useMemo(() => games.filter((game) => (sourceFilter === "ALL" || game.sourceType === sourceFilter) && (orgFilter === "ALL" || game.organizationId === orgFilter) && (ageFilter === "ALL" || game.ageGroup === ageFilter) && (dateFilter === "ALL" || dateKeyFromValue(game.gameDate) === dateFilter)), [ageFilter, dateFilter, games, orgFilter, sourceFilter]);
  const orgs = Array.from(new Map(games.map((g) => [g.organizationId, g.organizationLabel])).entries());
  const ageGroups = Array.from(new Set(games.map((g) => g.ageGroup))).sort((a, b) => a.localeCompare(b));
  const dateOptions = Array.from(new Map(games.filter((g) => dateKeyFromValue(g.gameDate)).map((g) => [dateKeyFromValue(g.gameDate), g.dateLabel || dateKeyFromValue(g.gameDate)])).entries()).sort(([a], [b]) => a.localeCompare(b));
  const scoredCount = games.filter((game) => game.scored).length;
  const gcCount = games.filter((game) => game.hasGameChanger).length;
  function updateDraft(gameId: string, side: "homeScore" | "awayScore", value: string) {
    if (!/^\d*$/.test(value)) return;
    setDrafts((prev) => ({ ...prev, [gameId]: { homeScore: prev[gameId]?.homeScore ?? "", awayScore: prev[gameId]?.awayScore ?? "", [side]: value } }));
  }
  async function saveScore(game: UnifiedScoreGame) {
    const draft = drafts[game.id] ?? { homeScore: "", awayScore: "" };
    if (!draft.homeScore || !draft.awayScore) { setError("Enter both scores before saving."); setNotice(""); return; }
    setBusyKey(game.id); setError(""); setNotice("");
    try {
      const res = await fetch("/api/admin/scores/unified", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceType: game.sourceType, organizationId: game.organizationId, sourceKey: game.sourceKey, matchId: game.matchId, ageGroup: game.ageGroup, homeTeam: game.homeTeam, awayTeam: game.awayTeam, gameDate: game.gameDate, gameStatus: game.status, homeScore: Number(draft.homeScore), awayScore: Number(draft.awayScore) }) });
      const json = await readJson(res); if (!res.ok) throw new Error(String(json.error || "Failed to save score"));
      setNotice(`Saved ${game.homeTeam} vs ${game.awayTeam}.`); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save score"); }
    finally { setBusyKey(""); }
  }
  function applyEmbedSnippet() {
    const result = parseGameChangerEmbedSnippet(embedSnippet);
    if (!result.ok) { setError(result.error); return; }
    setWidgetIdDraft(result.config.widgetId); setNotice("Parsed the GameChanger widget ID. Save the connection to use it here."); setError("");
  }
  async function saveGameChanger() {
    if (!target) return;
    const widgetId = widgetIdDraft.trim() || targetConnection?.widgetId || "";
    if (!widgetId) { setError("Enter a GameChanger widget ID first."); return; }
    setBusyKey("gc-save"); setError(""); setNotice("");
    try {
      const res = await fetch("/api/admin/scores/gamechanger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...target, widgetId, autoImportFinalScores: true }) });
      const json = await readJson(res); if (!res.ok) throw new Error(String(json.error || "Failed to save GameChanger connection"));
      setNotice(`Connected GameChanger to ${target.sourceLabel}.`); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save GameChanger connection"); }
    finally { setBusyKey(""); }
  }
  async function previewGameChanger() {
    if (!target) return;
    setBusyKey("gc-preview"); setError(""); setNotice("");
    try {
      const res = await fetch("/api/admin/scores/gamechanger/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
      const json = await readJson(res); if (!res.ok) throw new Error(String(json.error || "Failed to preview GameChanger scores"));
      setPreviewRows(json.rows ?? []); setNotice(`Found ${(json.rows ?? []).filter((row: PreviewRow) => row.outcome === "completed").length} completed GameChanger games.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to preview GameChanger scores"); }
    finally { setBusyKey(""); }
  }
  async function importGameChanger() {
    if (!target) return;
    setBusyKey("gc-import"); setError(""); setNotice("");
    try {
      const res = await fetch("/api/admin/scores/gamechanger/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
      const json = await readJson(res); if (!res.ok) throw new Error(String(json.error || "Failed to import GameChanger scores"));
      setPreviewRows(json.rows ?? []); setNotice(`Imported ${json.importedCount ?? 0} completed GameChanger scores.`); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to import GameChanger scores"); }
    finally { setBusyKey(""); }
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Scope" value={assignrScopeLabel(scope)} detail={`${seasonYear} season`} />
        <SummaryCard label="Games Loaded" value={String(games.length)} detail="League and tournament" />
        <SummaryCard label="Scores Saved" value={`${scoredCount}/${games.length}`} detail="Manual or imported" />
        <SummaryCard label="GameChanger" value={String(gcCount)} detail="Connected games" />
      </div>
      {(notice || error) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-red-500/40 bg-red-950/40 text-red-100" : "border-emerald-500/40 bg-emerald-950/40 text-emerald-100"}`}>{error || notice}</div>}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">GameChanger Service</p>
            <h2 className="mt-1 text-2xl font-bold">Connect a scoreboard once, use it from Scores</h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-400">{gameChangerExpanded ? "Choose a league or tournament source, paste the public GameChanger widget ID or embed snippet, then preview and import completed finals." : `${gcCount} loaded games currently have GameChanger connected.`}</p>
          </div>
          <button type="button" onClick={() => setGameChangerExpanded((current) => !current)} aria-expanded={gameChangerExpanded} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-brand-gold">
            {gameChangerExpanded ? "Hide service" : "Show service"}
          </button>
        </div>
        {gameChangerExpanded ? <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={previewGameChanger} disabled={!target || busyKey === "gc-preview"} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-brand-gold disabled:opacity-50">Preview</button>
            <button type="button" onClick={importGameChanger} disabled={!target || busyKey === "gc-import"} className="rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-50">Import Finals</button>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.6fr_1.4fr_1fr_auto]">
            <label className="text-sm text-zinc-300">Target Site
              <select value={activeTargetSite} onChange={(e) => { setSelectedTargetSite(e.target.value); setSelectedTargetSeason(""); setSelectedTargetKey(""); setPreviewRows([]); }} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white">
                {targetSiteOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-300">Season
              <select value={activeTargetSeason} onChange={(e) => { setSelectedTargetSeason(e.target.value); setSelectedTargetKey(""); setPreviewRows([]); }} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white">
                {targetSeasonOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-300">Age Division
              <select value={target ? sourceKey(target) : ""} onChange={(e) => { setSelectedTargetKey(e.target.value); setPreviewRows([]); }} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white">
                {filteredSourceTargets.map((item) => <option key={sourceKey(item)} value={sourceKey(item)}>{sourceOptionLabel(item)}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-300">Widget ID
              <input value={widgetIdDraft || targetConnection?.widgetId || ""} onChange={(e) => setWidgetIdDraft(e.target.value)} placeholder="GameChanger widget UUID" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
            </label>
            <button type="button" onClick={saveGameChanger} disabled={!target || busyKey === "gc-save"} className="self-end rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">Save Connection</button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <textarea value={embedSnippet} onChange={(e) => setEmbedSnippet(e.target.value)} rows={2} placeholder="Optional: paste the GameChanger embed snippet to extract the widget ID" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" />
            <button type="button" onClick={applyEmbedSnippet} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-brand-gold">Parse Snippet</button>
          </div>
          {previewRows.length > 0 && <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-zinc-800"><table className="min-w-full text-sm"><thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-400"><tr><th className="px-3 py-2 text-left">Game</th><th className="px-3 py-2 text-left">Match</th><th className="px-3 py-2 text-left">GC Status</th><th className="px-3 py-2 text-left">Score</th></tr></thead><tbody>{previewRows.slice(0, 40).map((row) => <tr key={row.matchId} className="border-t border-zinc-800"><td className="px-3 py-2">{row.gameLabel}</td><td className="px-3 py-2">{row.homeTeam} vs {row.awayTeam}</td><td className="px-3 py-2">{row.outcome}</td><td className="px-3 py-2">{row.homeScore ?? "-"} - {row.awayScore ?? "-"}</td></tr>)}</tbody></table></div>}
        </> : null}
      </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">Score Entry</p><h2 className="mt-1 text-2xl font-bold">League and tournament games</h2><p className="mt-1 text-sm text-zinc-400">Filter the loaded games, enter finals, and save without leaving the Scores module.</p></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as "ALL" | UnifiedScoreSourceType)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"><option value="ALL">All sources</option><option value="LEAGUE">League</option><option value="TOURNAMENT">Tournament</option></select>
            <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"><option value="ALL">All orgs</option>{orgs.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
            <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"><option value="ALL">All divisions</option>{ageGroups.map((group) => <option key={group} value={group}>{group}</option>)}</select>
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"><option value="ALL">All dates</option>{dateOptions.map(([key, label]) => <option key={key} value={key}>{dateOptionLabel(key, label)}</option>)}</select>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-400"><tr><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-left">Game</th><th className="px-3 py-2 text-left">Teams</th><th className="px-3 py-2 text-left">Current</th><th className="px-3 py-2 text-left">New Score</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
            <tbody>
              {visibleGames.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-500">No games match the current filters.</td></tr> : visibleGames.slice(0, 250).map((game) => {
                const draft = drafts[game.id] ?? { homeScore: "", awayScore: "" };
                return <tr key={game.id} className="border-t border-zinc-800 align-top"><td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(game.sourceType)}`}>{game.sourceType === "LEAGUE" ? "League" : "Tournament"}</span><div className="mt-1 text-xs text-zinc-500">{game.organizationLabel}</div></td><td className="px-3 py-3"><div className="font-medium text-white">{game.gameNumber ? `Game ${game.gameNumber}` : game.ageGroup}</div><div className="text-xs text-zinc-500">{game.dateLabel} {game.timeLabel}</div><div className="text-xs text-zinc-500">{game.sourceLabel}</div></td><td className="px-3 py-3"><div>{game.homeTeam}</div><div className="text-zinc-400">vs {game.awayTeam}</div></td><td className="px-3 py-3 font-semibold">{formatScore(game)}{game.hasGameChanger ? <div className="mt-1 text-xs text-emerald-300">GameChanger connected</div> : null}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><input aria-label={`${game.homeTeam} score`} value={draft.homeScore} onChange={(e) => updateDraft(game.id, "homeScore", e.target.value)} className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center text-white" /><span className="text-zinc-500">-</span><input aria-label={`${game.awayTeam} score`} value={draft.awayScore} onChange={(e) => updateDraft(game.id, "awayScore", e.target.value)} className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center text-white" /></div></td><td className="px-3 py-3 text-right"><button type="button" onClick={() => saveScore(game)} disabled={!game.canManualScore || busyKey === game.id} className="rounded-lg bg-brand-purple px-3 py-2 text-xs font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-50">Save</button></td></tr>;
              })}
            </tbody>
          </table>
        </div>
        {visibleGames.length > 250 ? <p className="mt-3 text-xs text-zinc-500">Showing first 250 games. Use filters to narrow the list.</p> : null}
      </section>
    </div>
  );
}
function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className="mt-2 text-2xl font-bold text-white">{value}</p><p className="mt-1 text-sm text-zinc-400">{detail}</p></div>;
}
