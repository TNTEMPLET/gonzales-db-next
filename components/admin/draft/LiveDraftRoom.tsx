"use client";

import { useEffect, useState } from "react";

type DraftPick = {
  id: string;
  round: number;
  overallPick: number;
  draftTeamId: string;
  playerPoolId: string;
  isProtectedPick: boolean;
};

type DraftPlayerPoolItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  guardianEmail: string | null;
  evaluationScore: number | null;
  notes: string | null;
  isDrafted: boolean;
  draftedTeamId: string | null;
};

type DraftTeam = {
  id: string;
  teamName: string;
  draftOrder: number;
  headCoach?: { name: string | null; email: string } | null;
  assistantCoach?: { name: string | null; email: string } | null;
  picks: DraftPick[];
};

type DraftSessionState = {
  session: {
    id: string;
    name: string;
    ageGroup: string;
    draftType: "SNAKE" | "LINEAR";
    status: "SETUP" | "PAIRED" | "LIVE" | "PAUSED" | "COMPLETED" | "MATERIALIZED";
    secondsPerPick: number | null;
    totalRounds: number;
    currentRound: number;
    currentPickIndex: number;
    teams: DraftTeam[];
    playerPool: DraftPlayerPoolItem[];
    picks: DraftPick[];
  };
  onClock: {
    teamId: string;
    teamName: string;
    headCoachName: string | null;
    round: number;
    overallPick: number;
    pickInRound: number;
    isProtectedPick: boolean;
    protectedPlayerName?: string;
  } | null;
};

type Props = {
  sessionId: string;
  onMaterializeComplete?: () => void;
};

export default function LiveDraftRoom({ sessionId, onMaterializeComplete }: Props) {
  const [data, setData] = useState<DraftSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [timeLeft, setTimeLeft] = useState(120);
  const [activeTab, setActiveTab] = useState<"BOARD" | "POOL" | "ROSTERS">("BOARD");

  const fetchSession = async () => {
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}`);
      if (!res.ok) throw new Error("Failed to load draft session");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
    const interval = setInterval(fetchSession, 4000); // Poll state every 4s
    return () => clearInterval(interval);
  }, [sessionId]);

  // Timer countdown logic
  useEffect(() => {
    if (!data || data.session.status !== "LIVE") return;
    setTimeLeft(data.session.secondsPerPick || 120);

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [data?.session.currentPickIndex, data?.session.status]);

  const handleMakePick = async (playerPoolId: string) => {
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerPoolId }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Pick failed");
      }
      await fetchSession();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUndoPick = async () => {
    if (!confirm("Undo the last pick?")) return;
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/pick`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Undo failed");
      await fetchSession();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleTogglePause = async () => {
    if (!data) return;
    const newStatus = data.session.status === "LIVE" ? "PAUSED" : "LIVE";
    try {
      await fetch(`/api/admin/draft/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchSession();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleMaterialize = async () => {
    if (!confirm("Materialize draft picks into official Teams Management?")) return;
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/materialize`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Materialization failed");
      await fetchSession();
      if (onMaterializeComplete) onMaterializeComplete();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Loading live draft room...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-rose-400">
        Error loading draft session: {error || "Session not found"}
      </div>
    );
  }

  const { session, onClock } = data;
  const availablePlayers = session.playerPool.filter(
    (p) =>
      !p.isDrafted &&
      (searchQuery === "" ||
        p.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.guardianEmail && p.guardianEmail.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="space-y-6">
      {/* On-The-Clock Banner (onlinedraft.com style) */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 font-mono font-black text-white text-xl shadow-lg border border-white/20">
              #{onClock ? onClock.overallPick : session.picks.length}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold tracking-wider text-slate-400 uppercase">
                  Round {onClock?.round || session.currentRound} · Pick {onClock?.pickInRound || 0}
                </span>
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-500/30">
                  {session.draftType}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    session.status === "LIVE"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse"
                      : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  }`}
                >
                  {session.status}
                </span>
              </div>

              <h2 className="text-2xl font-black text-white mt-1">
                {onClock ? (
                  <span className="text-emerald-400">{onClock.teamName}</span>
                ) : (
                  "Draft Completed"
                )}{" "}
                <span className="text-sm font-normal text-slate-400">
                  {onClock?.headCoachName ? `(Coach ${onClock.headCoachName})` : ""}
                </span>
              </h2>

              {onClock?.isProtectedPick && (
                <div className="mt-1 text-xs text-amber-400 font-semibold flex items-center gap-1">
                  🔒 Protected Pick: {onClock.protectedPlayerName || "Coach's Child"}
                </div>
              )}
            </div>
          </div>

          {/* Timer & Draft Controls */}
          <div className="flex items-center gap-3">
            {session.status === "LIVE" && (
              <div className="text-center px-4 py-2 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] uppercase text-slate-500 font-bold">Pick Clock</div>
                <div
                  className={`font-mono text-xl font-bold ${
                    timeLeft < 15 ? "text-rose-500 animate-ping" : "text-slate-200"
                  }`}
                >
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, "0")}
                </div>
              </div>
            )}

            <button
              onClick={handleTogglePause}
              className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 border border-slate-700"
            >
              {session.status === "LIVE" ? "⏸ Pause" : "▶ Resume"}
            </button>

            <button
              onClick={handleUndoPick}
              disabled={session.picks.length === 0}
              className="rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-40 border border-slate-700"
            >
              ↩ Undo Pick
            </button>

            {session.status === "COMPLETED" && (
              <button
                onClick={handleMaterialize}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-lg"
              >
                🚀 Materialize Teams
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab("BOARD")}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "BOARD"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          📋 Live Draft Board
        </button>
        <button
          onClick={() => setActiveTab("POOL")}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "POOL"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          🏃 Available Players ({availablePlayers.length})
        </button>
        <button
          onClick={() => setActiveTab("ROSTERS")}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
            activeTab === "ROSTERS"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          🛡️ Team Rosters
        </button>
      </div>

      {/* TAB A: Live Draft Matrix Board */}
      {activeTab === "BOARD" && (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${session.teams.length}, minmax(140px, 1fr))` }}>
            {/* Column Headers (Teams) */}
            {session.teams.map((team) => {
              const isOnClock = onClock?.teamId === team.id;
              return (
                <div
                  key={team.id}
                  className={`rounded-lg p-3 text-center border transition-all ${
                    isOnClock
                      ? "bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/40"
                      : "bg-slate-950/80 border-slate-800"
                  }`}
                >
                  <div className="text-xs font-extrabold uppercase text-slate-400">
                    Order #{team.draftOrder}
                  </div>
                  <div className="font-bold text-white text-sm truncate">{team.teamName}</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {team.headCoach?.name || "No Coach"}
                  </div>
                </div>
              );
            })}

            {/* Picks Matrix Rows */}
            {Array.from({ length: session.totalRounds }).map((_, rIdx) => {
              const roundNum = rIdx + 1;
              return session.teams.map((team) => {
                const pick = session.picks.find(
                  (p) => p.draftTeamId === team.id && p.round === roundNum
                );
                const player = pick
                  ? session.playerPool.find((p) => p.id === pick.playerPoolId)
                  : null;

                return (
                  <div
                    key={`${team.id}-r${roundNum}`}
                    className={`min-h-[64px] rounded-lg p-2 text-xs border flex flex-col justify-between ${
                      pick
                        ? "bg-slate-950/90 border-slate-700/80 text-white"
                        : "bg-slate-900/20 border-slate-800/40 text-slate-600"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>R{roundNum}</span>
                      {pick && <span>#{pick.overallPick}</span>}
                    </div>

                    {player ? (
                      <div className="font-bold text-emerald-400 truncate mt-1">
                        {player.fullName}
                      </div>
                    ) : (
                      <div className="text-[10px] italic text-slate-600">Open</div>
                    )}
                  </div>
                );
              });
            })}
          </div>
        </div>
      )}

      {/* TAB B: Available Player Pool Table */}
      {activeTab === "POOL" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <input
              type="text"
              placeholder="Search available players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-72 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-500"
            />
            <span className="text-xs text-slate-400">
              Showing {availablePlayers.length} unassigned players
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/80">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950 text-xs text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3">Player Name</th>
                  <th className="px-4 py-3">Guardian Email</th>
                  <th className="px-4 py-3 text-center">Rating</th>
                  <th className="px-4 py-3 text-right">Draft Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {availablePlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-white">{player.fullName}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{player.guardianEmail || "—"}</td>
                    <td className="px-4 py-3 text-center font-mono text-amber-400 font-bold">
                      {player.evaluationScore ? player.evaluationScore.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleMakePick(player.id)}
                        disabled={session.status !== "LIVE" || !onClock}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                      >
                        Draft Player
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB C: Team Rosters Detail */}
      {activeTab === "ROSTERS" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {session.teams.map((team) => {
            const teamPicks = session.picks.filter((p) => p.draftTeamId === team.id);

            return (
              <div
                key={team.id}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3"
              >
                <div className="border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-white text-base">{team.teamName}</h4>
                  <p className="text-xs text-slate-400">
                    Head Coach: {team.headCoach?.name || "Unassigned"}
                  </p>
                  <p className="text-[10px] text-emerald-400 font-bold">
                    Roster Size: {teamPicks.length} Players
                  </p>
                </div>

                <div className="space-y-1.5 text-xs">
                  {teamPicks.map((pick) => {
                    const player = session.playerPool.find((p) => p.id === pick.playerPoolId);
                    return (
                      <div
                        key={pick.id}
                        className="flex items-center justify-between rounded bg-slate-950/60 p-2 border border-slate-800"
                      >
                        <span className="font-medium text-slate-200">
                          {player?.fullName || "Player"}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          R{pick.round} (#P{pick.overallPick})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
