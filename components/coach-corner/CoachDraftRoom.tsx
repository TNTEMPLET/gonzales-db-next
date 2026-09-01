"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DraftSessionState } from "@/lib/draft/types";
import { getErrorMessage } from "@/lib/draft/clientError";
import { computePlayingAge } from "@/lib/draft/playingAge";
import { formatCentralDateTime } from "@/lib/draft/centralTime";
import { jitteredPollDelayMs } from "@/lib/draft/pollSchedule";

type Props = {
  sessionId: string;
  orgQuery: string;
  onBack?: () => void;
};

type CoachDraftState = DraftSessionState & { myTeamId: string | null; isAdmin: boolean };

/**
 * Coach Corner's live draft view -- a read-mostly sibling of
 * components/admin/draft/LiveDraftRoom.tsx. Every coach linked to the
 * session's org can spectate the full board and pick pool live (same 5s
 * poll), but the pick button only activates for the viewer's own team on
 * its turn. No settings/pool-management/reset/materialize/undo here --
 * those stay admin-only in the admin draft desk.
 */
export default function CoachDraftRoom({ sessionId, orgQuery, onBack }: Props) {
  const [data, setData] = useState<CoachDraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingPick, setSubmittingPick] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<"ALL" | "PITCHER" | "CATCHER" | "TOP_EVAL">("ALL");
  const [ageFilter, setAgeFilter] = useState<"ALL" | number>("ALL");
  const [sortBy, setSortBy] = useState<
    "EVAL_DESC" | "NAME_ASC" | "PITCHER_DESC" | "CATCHER_DESC" | "AGE_ASC" | "AGE_DESC"
  >("EVAL_DESC");

  const [timeLeft, setTimeLeft] = useState<number>(120);
  const [showRostersDrawer, setShowRostersDrawer] = useState(true);
  const lastPickIndexRef = useRef<number | undefined>(undefined);

  const fetchState = async () => {
    try {
      const res = await fetch(`/api/coach-corner/draft/sessions/${sessionId}?${orgQuery}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load draft session");
      }
      const json: CoachDraftState = await res.json();
      setData(json);
      setError(null);

      if (json.session.secondsPerPick && json.session.currentPickIndex !== lastPickIndexRef.current) {
        lastPickIndexRef.current = json.session.currentPickIndex;
        setTimeLeft(json.session.secondsPerPick);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const loop = async () => {
      await fetchState();
      if (cancelled) return;
      // 6-8s, jittered so every open tab doesn't poll in lock-step.
      timer = setTimeout(loop, jitteredPollDelayMs(6000, 2000));
    };
    loop();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (!data || data.session.status !== "LIVE") return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [data?.session.status]);

  const handleMakePick = async (playerPoolId: string) => {
    if (submittingPick) return;
    setSubmittingPick(true);
    try {
      const res = await fetch(`/api/coach-corner/draft/sessions/${sessionId}/pick?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerPoolId }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Pick failed: ${err.error}`);
      } else {
        await fetchState();
      }
    } catch (e) {
      alert(`Error submitting pick: ${getErrorMessage(e)}`);
    } finally {
      setSubmittingPick(false);
    }
  };

  const session = data?.session;
  const onClock = data?.onClock;
  const myTeamId = data?.myTeamId ?? null;
  const isAdmin = data?.isAdmin ?? false;
  const canPickNow = !!onClock && session?.status === "LIVE" && (isAdmin || onClock.teamId === myTeamId);
  const myTeam = session?.teams.find((t) => t.id === myTeamId) ?? null;

  const playingAgeOf = (birthDate: string | null) =>
    session ? computePlayingAge(birthDate, session.seasonYear) : null;

  const availableAges = useMemo(() => {
    if (!session) return [];
    const ages = new Set<number>();
    for (const p of session.playerPool) {
      if (p.isDrafted) continue;
      const age = playingAgeOf(p.birthDate);
      if (age !== null) ages.add(age);
    }
    return [...ages].sort((a, b) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const availablePlayers = useMemo(() => {
    if (!session) return [];
    let list = session.playerPool.filter((p) => !p.isDrafted);

    if (positionFilter === "PITCHER") {
      list = list.filter((p) => (p.pitcherRating || 0) >= 3);
    } else if (positionFilter === "CATCHER") {
      list = list.filter((p) => (p.catcherRating || 0) >= 3);
    } else if (positionFilter === "TOP_EVAL") {
      list = list.filter((p) => (p.evaluationScore || 0) >= 80);
    }

    if (ageFilter !== "ALL") {
      list = list.filter((p) => playingAgeOf(p.birthDate) === ageFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          (p.guardianEmail && p.guardianEmail.toLowerCase().includes(q)) ||
          (p.notes && p.notes.toLowerCase().includes(q)),
      );
    }

    return list.sort((a, b) => {
      if (sortBy === "EVAL_DESC") return (b.evaluationScore || 0) - (a.evaluationScore || 0);
      if (sortBy === "NAME_ASC") return a.fullName.localeCompare(b.fullName);
      if (sortBy === "PITCHER_DESC") return (b.pitcherRating || 0) - (a.pitcherRating || 0);
      if (sortBy === "CATCHER_DESC") return (b.catcherRating || 0) - (a.catcherRating || 0);
      if (sortBy === "AGE_ASC" || sortBy === "AGE_DESC") {
        const ageA = playingAgeOf(a.birthDate);
        const ageB = playingAgeOf(b.birthDate);
        if (ageA === null) return 1;
        if (ageB === null) return -1;
        return sortBy === "AGE_ASC" ? ageA - ageB : ageB - ageA;
      }
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, positionFilter, ageFilter, searchQuery, sortBy]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-3xl animate-bounce">⚾</div>
          <div className="text-sm font-semibold text-zinc-400">Loading Live Draft Room...</div>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-rose-400 space-y-3">
        <div className="text-xl font-bold">Failed to load draft session</div>
        <p className="text-xs">{error}</p>
        <button
          onClick={fetchState}
          className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalPicksMade = session.picks.length;
  const totalDraftSlots = session.teams.length * session.totalRounds;
  const progressPercent = Math.min(100, Math.round((totalPicksMade / (totalDraftSlots || 1)) * 100));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white"
              >
                ← Back to Drafts
              </button>
            )}
            <div>
              <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <span>⚾</span> {session.name}
              </h2>
              <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                <span className="font-semibold text-emerald-400">{session.ageGroup}</span>
                <span>•</span>
                <span>{session.draftType} Draft</span>
                <span>•</span>
                <span>{session.teams.length} Teams</span>
                <span>•</span>
                <span>{session.totalRounds} Rounds</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {myTeam ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs">
                <span className="text-emerald-400 font-extrabold">🛡️ Your Team:</span>
                <span className="font-bold text-white">{myTeam.teamName}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-zinc-800/60 border border-zinc-700 px-3 py-1.5 text-xs">
                <span className="text-zinc-400 font-semibold">👀 Spectating</span>
              </div>
            )}
            <button
              onClick={() => setShowRostersDrawer(!showRostersDrawer)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                showRostersDrawer
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
              }`}
            >
              🛡️ Team Rosters
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-12 items-center">
          <div className="lg:col-span-8 rounded-xl bg-zinc-950 border border-zinc-800 p-4 relative overflow-hidden">
            {session.status === "COMPLETED" || session.status === "MATERIALIZED" ? (
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Draft Status: Complete
                </div>
                <h3 className="text-lg font-black text-white">All {totalPicksMade} Picks Recorded! 🎉</h3>
                <p className="text-xs text-zinc-400">
                  {session.status === "MATERIALIZED"
                    ? "These picks have been copied into official team rosters."
                    : "Your league admin will finalize these picks into official team rosters shortly."}
                </p>
              </div>
            ) : onClock ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-400 animate-pulse">
                      <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                      ON THE CLOCK
                    </span>
                    <span className="text-xs font-bold text-zinc-400">
                      Round {onClock.round} · Pick #{onClock.overallPick} (#{onClock.pickInRound} in Round)
                    </span>
                  </div>

                  <h3 className="text-2xl font-black text-white tracking-tight">{onClock.teamName}</h3>

                  <div className="text-xs text-zinc-400">
                    Head Coach: <span className="font-semibold text-zinc-200">{onClock.headCoachName || "Unassigned"}</span>
                  </div>

                  {onClock.isProtectedPick ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs text-amber-300">
                        <span>{onClock.protectedPlayerProtectionType === "RETURNING_PLAYER" ? "🏠" : "🔒"}</span>
                        <span>
                          {onClock.protectedPlayerProtectionType === "RETURNING_PLAYER"
                            ? "Returning Player"
                            : "Coach Child Protection"}
                          : <strong>{onClock.protectedPlayerName}</strong>
                        </span>
                      </div>
                      {onClock.protectedPlayerPoolId && canPickNow && (
                        <button
                          onClick={() => handleMakePick(onClock.protectedPlayerPoolId!)}
                          disabled={submittingPick}
                          className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-black text-zinc-950 hover:bg-amber-400 shadow transition-all active:scale-95 disabled:opacity-40"
                        >
                          {submittingPick ? "Locking..." : `⚡ Auto-Lock ${onClock.protectedPlayerName} ➔`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs text-emerald-400 font-medium">
                      <span>⚾</span>
                      <span>Open Draft Pick (No coach protection in Round {onClock.round})</span>
                    </div>
                  )}

                  {!canPickNow && (
                    <p className="mt-1 text-[11px] text-zinc-500 italic">
                      {session.status !== "LIVE"
                        ? "Draft is paused -- picks resume when your admin restarts it."
                        : "Waiting on this team's coach to pick."}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-2 text-sm text-zinc-400 space-y-1">
                <div>Draft session is in {session.status} mode.</div>
                {session.scheduledStartAt && (
                  <div className="text-amber-400 font-semibold">
                    🕐 Scheduled to start {formatCentralDateTime(session.scheduledStartAt)}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 rounded-xl bg-zinc-950 border border-zinc-800 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Pick Timer</span>
              <span
                className={`font-mono text-2xl font-black ${
                  timeLeft <= 15 ? "text-rose-400 animate-pulse" : timeLeft <= 30 ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                {session.secondsPerPick ? `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, "0")}` : "UNTYMED"}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>Draft Progress</span>
                <span className="font-bold text-white">
                  {totalPicksMade} / {totalDraftSlots} Picks ({progressPercent}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRostersDrawer && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🛡️</span> Team Rosters & Drafted Players Overview
            </h3>
            <button onClick={() => setShowRostersDrawer(false)} className="text-xs text-zinc-400 hover:text-white">
              ✕ Close Overview
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {session.teams.map((team) => {
              const teamPicks = session.picks.filter((p) => p.draftTeamId === team.id);
              const isMine = team.id === myTeamId;
              return (
                <div
                  key={team.id}
                  className={`rounded-xl border p-3.5 space-y-2.5 ${
                    isMine ? "border-emerald-500/50 bg-emerald-950/20" : "border-zinc-800 bg-zinc-950/90"
                  }`}
                >
                  <div className="border-b border-zinc-800/80 pb-2 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-white text-sm">
                        {team.teamName} {isMine ? <span className="text-emerald-400">(You)</span> : null}
                      </h4>
                      <p className="text-[11px] text-zinc-400">{team.headCoach?.name || "Unassigned"}</p>
                    </div>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">
                      {teamPicks.length}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs max-h-48 overflow-y-auto pr-1">
                    {teamPicks.length === 0 ? (
                      <div className="text-[11px] text-zinc-600 italic py-2">No players drafted yet</div>
                    ) : (
                      teamPicks.map((pick) => {
                        const player = session.playerPool.find((p) => p.id === pick.playerPoolId);
                        return (
                          <div
                            key={pick.id}
                            className="flex items-center justify-between rounded bg-zinc-900/80 px-2 py-1 border border-zinc-800/60"
                          >
                            <span className="font-medium text-zinc-200 truncate">{player?.fullName || "Player"}</span>
                            <span className="text-[10px] font-mono text-zinc-500 ml-1 shrink-0">
                              R{pick.round}.P{pick.overallPick}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>📊</span> Live Draft Board (Matrix)
          </h3>
          <span className="text-xs text-zinc-400">
            {session.teams.length} Teams · {session.totalRounds} Rounds · {session.draftType} Flow
          </span>
        </div>

        <div className="overflow-x-auto max-h-[380px] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${session.teams.length}, minmax(150px, 1fr))` }}
          >
            {session.teams.map((team) => {
              const isOnClock = onClock?.teamId === team.id;
              const teamPicksCount = session.picks.filter((p) => p.draftTeamId === team.id).length;
              return (
                <div
                  key={team.id}
                  className={`sticky top-0 z-10 rounded-xl p-2.5 text-center border transition-all ${
                    isOnClock
                      ? "bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/40 shadow-lg shadow-emerald-900/30"
                      : team.id === myTeamId
                      ? "bg-emerald-950/30 border-emerald-800/60"
                      : "bg-zinc-900/90 border-zinc-800 backdrop-blur"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono font-bold mb-0.5">
                    <span>Order #{team.draftOrder}</span>
                    <span className="rounded bg-zinc-800 px-1 text-emerald-400">{teamPicksCount}</span>
                  </div>
                  <div className="font-bold text-white text-sm truncate">{team.teamName}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{team.headCoach?.name || "No Coach"}</div>
                </div>
              );
            })}

            {Array.from({ length: session.totalRounds }).map((_, rIdx) => {
              const roundNum = rIdx + 1;
              return session.teams.map((team) => {
                const pick = session.picks.find((p) => p.draftTeamId === team.id && p.round === roundNum);
                const player = pick ? session.playerPool.find((p) => p.id === pick.playerPoolId) : null;
                const isCurrentlyOnClock = onClock && onClock.teamId === team.id && onClock.round === roundNum;
                const reservedProtection = !pick
                  ? session.protections.find(
                      (pr) => pr.draftTeamId === team.id && pr.protectedRound === roundNum && !pr.isClaimed && !pr.isOverridden,
                    )
                  : undefined;

                return (
                  <div
                    key={`${team.id}-r${roundNum}`}
                    className={`min-h-[60px] rounded-lg p-2 text-xs border flex flex-col justify-between transition-all ${
                      isCurrentlyOnClock
                        ? "bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/40 animate-pulse"
                        : pick
                        ? "bg-zinc-900/90 border-zinc-700/80 text-white hover:border-zinc-500"
                        : reservedProtection
                        ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                        : "bg-zinc-950/40 border-zinc-800/40 text-zinc-600"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>R{roundNum}</span>
                      {pick && <span className="font-mono text-zinc-400 font-bold">#{pick.overallPick}</span>}
                    </div>

                    {player ? (
                      <div className="mt-1">
                        <div className="font-bold text-emerald-400 truncate text-xs">{player.fullName}</div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 mt-0.5">
                          <span>{player.evaluationScore ? `${player.evaluationScore.toFixed(1)} pts` : ""}</span>
                          {pick?.isProtectedPick &&
                            (() => {
                              const matchedProtection = session.protections.find(
                                (pr) => pr.draftTeamId === team.id && pr.protectedRound === roundNum,
                              );
                              const isReturning = matchedProtection?.protectionType === "RETURNING_PLAYER";
                              return (
                                <span className="text-amber-400" title={isReturning ? "Returning Player" : "Coach Protection"}>
                                  {isReturning ? "🏠" : "🔒"}
                                </span>
                              );
                            })()}
                        </div>
                      </div>
                    ) : isCurrentlyOnClock ? (
                      <div className="text-[11px] font-black text-emerald-400 animate-pulse py-1">ON CLOCK ⏱️</div>
                    ) : reservedProtection ? (
                      <div className="mt-1">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-amber-300">
                          <span>{reservedProtection.protectionType === "RETURNING_PLAYER" ? "🏠" : "🔒"}</span>
                          <span className="truncate">{reservedProtection.playerName}</span>
                        </div>
                        <div className="text-[9px] italic text-amber-400/70">Reserved</div>
                      </div>
                    ) : (
                      <div className="text-[10px] italic text-zinc-600 py-1">Open</div>
                    )}
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🏃</span> Available Players Pool
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                {availablePlayers.length} Available
              </span>
            </h3>
            <p className="text-xs text-zinc-400">
              {canPickNow
                ? <>Click &quot;Draft Player&quot; to pick for <span className="text-emerald-400 font-bold">{onClock?.teamName}</span></>
                : "You can draft when it's your team's turn."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search player name, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-white focus:border-emerald-500"
            />
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value as typeof positionFilter)}
              className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300"
            >
              <option value="ALL">All Positions</option>
              <option value="PITCHER">Pitchers (3+)</option>
              <option value="CATCHER">Catchers (3+)</option>
              <option value="TOP_EVAL">Top Evals (80+)</option>
            </select>
            <select
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value === "ALL" ? "ALL" : parseInt(e.target.value, 10))}
              className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300"
              title={`Playing age as of 4/30/${(session?.seasonYear || 0) + 1}`}
            >
              <option value="ALL">All Ages</option>
              {availableAges.map((age) => (
                <option key={age} value={age}>
                  Age {age} only
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-lg bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300"
            >
              <option value="EVAL_DESC">Sort: Eval (High to Low)</option>
              <option value="NAME_ASC">Sort: Name (A-Z)</option>
              <option value="PITCHER_DESC">Sort: Pitcher Rating</option>
              <option value="CATCHER_DESC">Sort: Catcher Rating</option>
              <option value="AGE_ASC">Sort: Age (Youngest First)</option>
              <option value="AGE_DESC">Sort: Age (Oldest First)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 max-h-[440px] overflow-y-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 text-[11px] uppercase text-zinc-400">
              <tr>
                <th className="px-4 py-3">Player Name</th>
                <th className="px-4 py-3 text-center">Age</th>
                <th className="px-4 py-3 text-center">Eval Score</th>
                <th className="px-4 py-3 text-center">Pitcher</th>
                <th className="px-4 py-3 text-center">Catcher</th>
                <th className="px-4 py-3">Notes & Guardian</th>
                <th className="px-4 py-3 text-right">Draft Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {availablePlayers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-zinc-500">
                    No available players match your search / filter criteria.
                  </td>
                </tr>
              ) : (
                availablePlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-zinc-900/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-white">
                      <div className="text-sm">{player.fullName}</div>
                      {player.guardianEmail && <div className="text-[10px] text-zinc-500">{player.guardianEmail}</div>}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-zinc-300 font-bold text-sm">
                      {playingAgeOf(player.birthDate) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-amber-400 font-bold text-sm">
                      {player.evaluationScore !== null ? player.evaluationScore.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {player.pitcherRating ? (
                        <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                          P: {player.pitcherRating}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {player.catcherRating ? (
                        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                          C: {player.catcherRating}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-[11px]">{player.notes || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleMakePick(player.id)}
                        disabled={!canPickNow || submittingPick}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-40 shadow transition-all active:scale-95"
                        title={!canPickNow ? "It's not your team's turn yet" : undefined}
                      >
                        {submittingPick ? "Drafting..." : canPickNow ? `Draft for ${onClock?.teamName} ➔` : "Not Your Turn"}
                      </button>
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
