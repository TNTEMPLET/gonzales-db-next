"use client";

import { useState } from "react";

import type { GameDayScoreGame } from "@/lib/admin/gameDay/types";

type Draft = { home: string; away: string };

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "save"] as const;

export default function GameDayScorePads({ games }: { games: GameDayScoreGame[] }) {
  const [rows, setRows] = useState(games);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      games.map((game) => [
        game.id,
        {
          home: game.homeScore == null ? "" : String(game.homeScore),
          away: game.awayScore == null ? "" : String(game.awayScore),
        },
      ]),
    ),
  );
  const [active, setActive] = useState<{ id: string; side: "home" | "away" } | null>(
    games[0] ? { id: games[0].id, side: "away" } : null,
  );
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function press(game: GameDayScoreGame, key: (typeof KEYS)[number]) {
    if (key === "save") {
      void save(game);
      return;
    }
    const side = active?.id === game.id ? active.side : "away";
    if (active?.id !== game.id) setActive({ id: game.id, side });
    setDrafts((prev) => {
      const row = prev[game.id] ?? { home: "", away: "" };
      const current = row[side];
      const next = key === "back" ? current.slice(0, -1) : `${current}${key}`.slice(0, 2);
      return { ...prev, [game.id]: { ...row, [side]: next } };
    });
  }

  async function save(game: GameDayScoreGame) {
    const draft = drafts[game.id] ?? { home: "", away: "" };
    if (draft.home === "" || draft.away === "") {
      setError("Enter both scores before saving.");
      setNotice("");
      return;
    }
    setBusyId(game.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/scores/unified", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "LEAGUE",
          organizationId: game.organizationId,
          sourceKey: game.sourceKey,
          matchId: game.matchId,
          ageGroup: game.ageGroup,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          gameDate: game.gameDate,
          gameStatus: "A",
          homeScore: Number(draft.home),
          awayScore: Number(draft.away),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Could not save that score.");
      const homeScore = Number(draft.home);
      const awayScore = Number(draft.away);
      setRows((prev) => prev.map((row) => (row.id === game.id ? { ...row, homeScore, awayScore } : row)));
      setNotice(`Saved ${game.awayTeam} ${awayScore}, ${game.homeTeam} ${homeScore}.`);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not save that score.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-4">
      {notice ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p> : null}
      {rows.map((game) => {
        const draft = drafts[game.id] ?? { home: "", away: "" };
        const open = active?.id === game.id;
        const side = open ? active.side : "away";
        return (
          <article key={game.id} className="rounded-2xl border border-neutral-300 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-neutral-600">{game.when}</p>
                <p className="text-sm text-neutral-700">{game.place}</p>
              </div>
              <LeagueBadge label={game.leagueLabel} background={game.leaguePrimaryHex} color={game.badgeText} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <ScoreSide
                label="Away"
                team={game.awayTeam}
                value={draft.away}
                pressed={open && side === "away"}
                onClick={() => setActive({ id: game.id, side: "away" })}
              />
              <ScoreSide
                label="Home"
                team={game.homeTeam}
                value={draft.home}
                pressed={open && side === "home"}
                onClick={() => setActive({ id: game.id, side: "home" })}
              />
            </div>
            {open ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={busyId === game.id}
                    onClick={() => press(game, key)}
                    className={`min-h-14 rounded-xl text-lg font-semibold ${
                      key === "save"
                        ? "bg-neutral-950 text-white"
                        : "border border-neutral-300 bg-neutral-50 text-neutral-950"
                    }`}
                  >
                    {key === "back" ? "Del" : key === "save" ? (busyId === game.id ? "Saving" : "Save") : key}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function ScoreSide({
  label,
  team,
  value,
  pressed,
  onClick,
}: {
  label: string;
  team: string;
  value: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={`min-h-20 rounded-xl border px-3 py-2 text-left ${
        pressed ? "border-neutral-950 bg-neutral-950 text-white" : "border-neutral-300 bg-neutral-50 text-neutral-950"
      }`}
    >
      <span className="block text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
      <span className="mt-1 block text-sm font-medium">{team}</span>
      <span className="mt-1 block text-3xl font-bold tabular-nums">{value === "" ? "–" : value}</span>
    </button>
  );
}

function LeagueBadge({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: background, color }}
    >
      {label}
    </span>
  );
}
