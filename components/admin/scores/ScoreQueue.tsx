"use client";

import { useEffect, useMemo, useState } from "react";

import {
  defaultScoreQueueFilters,
  filledUnscoredDrafts,
  filterScoreQueueGames,
  nextUnscoredGame,
  scoreGameDateKey,
} from "@/lib/admin/scoreQueueHelpers";
import { leagueCalendarDate } from "@/lib/seasonConfig";
import type { UnifiedScoreGame } from "@/lib/admin/unifiedScoreSources";

type ScoreDraft = Record<string, { homeScore: string; awayScore: string }>;

function draftsFromGames(games: UnifiedScoreGame[]): ScoreDraft {
  return Object.fromEntries(
    games.map((game) => [
      game.id,
      {
        homeScore: game.homeScore == null ? "" : String(game.homeScore),
        awayScore: game.awayScore == null ? "" : String(game.awayScore),
      },
    ]),
  );
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function ScoreQueue({ games }: { games: UnifiedScoreGame[] }) {
  const [rows, setRows] = useState(games);
  const [drafts, setDrafts] = useState<ScoreDraft>(() => draftsFromGames(games));
  const [filters, setFilters] = useState(() => defaultScoreQueueFilters(games));
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(games);
    setDrafts(draftsFromGames(games));
    setFilters(defaultScoreQueueFilters(games));
  }, [games]);

  const parks = useMemo(
    () =>
      Array.from(new Set(rows.map((game) => game.venue).filter((venue): venue is string => Boolean(venue)))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [rows],
  );
  const ageGroups = useMemo(
    () => Array.from(new Set(rows.map((game) => game.ageGroup))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const dateOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const game of rows) {
      const key = scoreGameDateKey(game);
      if (key && !map.has(key)) map.set(key, game.dateLabel || key);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [rows]);

  const visibleGames = useMemo(
    () => filterScoreQueueGames(rows, filters),
    [filters, rows],
  );
  const missingCount = rows.filter((game) => !game.scored).length;
  const todayKey = leagueCalendarDate();
  const missingToday = rows.filter(
    (game) => !game.scored && scoreGameDateKey(game) === todayKey,
  ).length;
  const filledVisible = filledUnscoredDrafts(visibleGames, drafts);

  function updateDraft(gameId: string, side: "homeScore" | "awayScore", value: string) {
    if (!/^\d*$/.test(value)) return;
    setDrafts((prev) => ({
      ...prev,
      [gameId]: {
        homeScore: prev[gameId]?.homeScore ?? "",
        awayScore: prev[gameId]?.awayScore ?? "",
        [side]: value,
      },
    }));
  }

  function markSaved(game: UnifiedScoreGame, homeScore: number, awayScore: number) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === game.id
          ? { ...row, homeScore, awayScore, scored: true }
          : row,
      ),
    );
    setDrafts((prev) => ({
      ...prev,
      [game.id]: { homeScore: String(homeScore), awayScore: String(awayScore) },
    }));
  }

  function focusHomeInput(gameId: string) {
    const input = document.querySelector<HTMLInputElement>(
      `[data-score-home="${CSS.escape(gameId)}"]`,
    );
    input?.focus();
    input?.select();
  }

  async function saveScore(game: UnifiedScoreGame, advance: boolean) {
    const draft = drafts[game.id] ?? { homeScore: "", awayScore: "" };
    if (!draft.homeScore || !draft.awayScore) {
      setError("Enter both scores before saving.");
      setNotice("");
      return;
    }
    const homeScore = Number(draft.homeScore);
    const awayScore = Number(draft.awayScore);
    setBusyKey(game.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/scores/unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: game.sourceType,
          organizationId: game.organizationId,
          sourceKey: game.sourceKey,
          matchId: game.matchId,
          ageGroup: game.ageGroup,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          gameDate: game.gameDate,
          gameStatus: game.status,
          homeScore,
          awayScore,
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(String(json.error || "Failed to save score"));
      markSaved(game, homeScore, awayScore);
      setNotice(`Saved ${game.homeTeam} ${homeScore}–${awayScore} ${game.awayTeam}.`);
      if (advance) {
        const remaining = filterScoreQueueGames(
          rows.map((row) =>
            row.id === game.id ? { ...row, scored: true, homeScore, awayScore } : row,
          ),
          filters,
        );
        const next = nextUnscoredGame(remaining, game.id);
        if (next) {
          window.requestAnimationFrame(() => focusHomeInput(next.id));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save score");
    } finally {
      setBusyKey("");
    }
  }

  async function saveAllFilled() {
    if (filledVisible.length === 0) return;
    setBusyKey("save-all");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/scores/unified/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scores: filledVisible.map((game) => ({
            organizationId: game.organizationId,
            matchId: game.matchId,
            ageGroup: game.ageGroup,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            gameDate: game.gameDate,
            homeScore: Number(drafts[game.id]?.homeScore),
            awayScore: Number(drafts[game.id]?.awayScore),
          })),
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(String(json.error || "Failed to save scores"));
      for (const game of filledVisible) {
        markSaved(
          game,
          Number(drafts[game.id]?.homeScore),
          Number(drafts[game.id]?.awayScore),
        );
      }
      setNotice(`Saved ${filledVisible.length} game${filledVisible.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save scores");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Needs scores" value={String(missingCount)} detail="Posted games this season" />
        <SummaryCard label="Missing today" value={String(missingToday)} detail="Central time" />
        <SummaryCard
          label="Scored"
          value={`${rows.filter((game) => game.scored).length}/${rows.length}`}
          detail="Loaded league games"
        />
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold">Score queue</p>
          <h2 className="mt-1 text-2xl font-bold">Needs scores</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Type home, Tab, away, Enter. Enter saves and jumps to the next open game.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filters.parkName}
            onChange={(event) => setFilters((prev) => ({ ...prev, parkName: event.target.value }))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            aria-label="Park"
          >
            <option value="ALL">All parks</option>
            {parks.map((park) => (
              <option key={park} value={park}>
                {park}
              </option>
            ))}
          </select>
          <select
            value={filters.ageGroup}
            onChange={(event) => setFilters((prev) => ({ ...prev, ageGroup: event.target.value }))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            aria-label="Division"
          >
            <option value="ALL">All divisions</option>
            {ageGroups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
          <select
            value={filters.dateKey}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateKey: event.target.value }))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          >
            <option value="ALL">All dates</option>
            {dateOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {key === todayKey ? `Today (${label})` : label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={filters.showScored}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, showScored: event.target.checked }))
              }
            />
            Show scored
          </label>
          <button
            type="button"
            onClick={() => void saveAllFilled()}
            disabled={filledVisible.length === 0 || busyKey === "save-all"}
            className="rounded-lg bg-brand-purple px-3 py-2 text-sm font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-50"
          >
            Save all ({filledVisible.length})
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-950 text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Game</th>
              <th className="px-3 py-2 text-left">Teams</th>
              <th className="px-3 py-2 text-left">Current</th>
              <th className="px-3 py-2 text-left">New score</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleGames.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  {rows.length === 0
                    ? "No posted league games are ready to score yet."
                    : !filters.showScored && rows.some((game) => game.scored)
                      ? "All games in this view are scored. Turn on Show scored to review them."
                      : "No games match the current filters."}
                </td>
              </tr>
            ) : (
              visibleGames.map((game) => {
                const draft = drafts[game.id] ?? { homeScore: "", awayScore: "" };
                return (
                  <tr key={game.id} className="border-t border-zinc-800 align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-white">{game.ageGroup}</div>
                      <div className="text-xs text-zinc-500">
                        {game.dateLabel} {game.timeLabel}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {[game.venue, game.field].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{game.homeTeam}</div>
                      <div className="text-zinc-400">vs {game.awayTeam}</div>
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      {game.scored ? `${game.homeScore} - ${game.awayScore}` : "Missing"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`${game.homeTeam} score`}
                          data-score-home={game.id}
                          value={draft.homeScore}
                          onChange={(event) => updateDraft(game.id, "homeScore", event.target.value)}
                          className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center text-white"
                        />
                        <span className="text-zinc-500">-</span>
                        <input
                          aria-label={`${game.awayTeam} score`}
                          value={draft.awayScore}
                          onChange={(event) => updateDraft(game.id, "awayScore", event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void saveScore(game, true);
                            }
                          }}
                          className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-center text-white"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void saveScore(game, false)}
                        disabled={!game.canManualScore || busyKey === game.id}
                        className="rounded-lg bg-brand-purple px-3 py-2 text-xs font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-50"
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-sm text-zinc-400">{detail}</p>
    </div>
  );
}
