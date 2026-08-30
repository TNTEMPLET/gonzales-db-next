"use client";

import { useEffect, useState } from "react";
import type { DraftPlayerPoolItem, DraftTeam, DraftUserRef } from "@/lib/draft/types";
import { getErrorMessage } from "@/lib/draft/clientError";

type CoachOption = DraftUserRef;

function protectionTypeLabel(type: string): string {
  if (type === "ASSISTANT_COACH_CHILD") return "Assistant Child";
  if (type === "RETURNING_PLAYER") return "Returning Player";
  return "Head Coach Child";
}

type Props = {
  sessionId: string;
  availableCoaches: CoachOption[];
  totalRounds: number;
  onClose: () => void;
  onUpdated: () => void;
};

export default function DraftTeamsManageModal({
  sessionId,
  availableCoaches,
  totalRounds,
  onClose,
  onUpdated,
}: Props) {
  const [teams, setTeams] = useState<DraftTeam[]>([]);
  const [poolPlayers, setPoolPlayers] = useState<DraftPlayerPoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState("");
  const [addingTeam, setAddingTeam] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-team quick protection input state
  const [addingProtectionTeamId, setAddingProtectionTeamId] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [newChildRound, setNewChildRound] = useState(1);
  const [newChildRole, setNewChildRole] = useState<
    "HEAD_COACH_CHILD" | "ASSISTANT_COACH_CHILD" | "RETURNING_PLAYER"
  >("HEAD_COACH_CHILD");

  // `silent` skips the loading-spinner placeholder -- used for refetches after
  // a save (add/edit/reorder/delete) so the team list never gets swapped out
  // and back in, which was resetting this panel's scroll position on every
  // save. Only the very first load (on mount) shows the spinner.
  const fetchTeams = async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/teams`);
      const data = await res.json();
      if (data.teams) {
        setTeams(data.teams);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  const fetchPoolPlayers = async () => {
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/players`);
      const data = await res.json();
      if (data.players) {
        setPoolPlayers(data.players);
      }
    } catch (e) {
      console.error("Failed to load player pool:", e);
    }
  };

  useEffect(() => {
    fetchTeams();
    fetchPoolPlayers();
  }, [sessionId]);

  // Players already linked to a protection anywhere in this session, so the
  // picker only offers players who are still available to link.
  const protectedPlayerNames = new Set(
    teams.flatMap((t) => (t.protections || []).map((p) => p.playerName))
  );
  const linkablePlayers = poolPlayers.filter(
    (p) => !p.isDrafted && !protectedPlayerNames.has(p.fullName)
  );

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) return;
    setAddingTeam(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName: newTeamName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add team");
      }
      setNewTeamName("");
      fetchTeams({ silent: true });
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setAddingTeam(false);
    }
  };

  const handleUpdateCoach = async (teamId: string, role: "HEAD" | "ASSISTANT", userId: string) => {
    try {
      const body: { teamId: string; headCoachUserId?: string | null; assistantUserId?: string | null } = { teamId };
      if (role === "HEAD") body.headCoachUserId = userId || null;
      if (role === "ASSISTANT") body.assistantUserId = userId || null;

      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/teams`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update coach");
      }
      fetchTeams({ silent: true });
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleMoveOrder = async (index: number, direction: "UP" | "DOWN") => {
    const targetIndex = direction === "UP" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= teams.length) return;

    const newTeams = [...teams];
    const [moved] = newTeams.splice(index, 1);
    newTeams.splice(targetIndex, 0, moved);

    const teamOrders = newTeams.map((t, idx) => ({
      teamId: t.id,
      draftOrder: idx + 1,
    }));

    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/teams`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", teamOrders }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reorder teams");
      }
      fetchTeams({ silent: true });
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm("Are you sure you want to remove this team from the draft?")) return;
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/teams?teamId=${teamId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete team");
      }
      fetchTeams({ silent: true });
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleAddProtection = async (teamId: string) => {
    if (!newChildName.trim()) return;
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/protections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftTeamId: teamId,
          playerName: newChildName.trim(),
          protectedRound: newChildRound,
          protectionType: newChildRole,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add coach protection");
      }
      setNewChildName("");
      setAddingProtectionTeamId(null);
      fetchTeams({ silent: true });
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleUpdateProtectionRound = async (protectionId: string, round: number) => {
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/protections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protectionId,
          protectedRound: round,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update round");
      }
      fetchTeams({ silent: true });
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleToggleProtectionOverride = async (protectionId: string, isOverridden: boolean) => {
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/protections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protectionId, isOverridden }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update override");
      }
      fetchTeams({ silent: true });
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleDeleteProtection = async (protectionId: string) => {
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/protections?protectionId=${protectionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove protection");
      }
      fetchTeams({ silent: true });
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🛡️</span> Manage Teams, Coaches & Linked Player Protections
            </h3>
            <p className="text-xs text-zinc-400">
              Assign coaches to draft positions and lock their linked players to specific draft rounds.
              Unlinked rounds remain open for normal draft picks.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-300 hover:text-white font-bold ml-2">✕</button>
          </div>
        )}

        {/* Add Team Box */}
        <div className="flex items-center gap-2 rounded-xl bg-zinc-950 p-3 border border-zinc-800">
          <input
            type="text"
            placeholder="Add new team name (e.g. Astros)..."
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTeam()}
            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-sm text-white focus:border-emerald-500"
          />
          <button
            onClick={handleAddTeam}
            disabled={addingTeam || !newTeamName.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {addingTeam ? "Adding..." : "+ Add Team"}
          </button>
        </div>

        {/* Teams List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="p-8 text-center text-xs text-zinc-500 animate-pulse">Loading draft teams...</div>
          ) : teams.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">No teams configured in this draft session.</div>
          ) : (
            teams.map((team, idx) => {
              const teamProtections = team.protections || [];

              return (
                <div
                  key={team.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 space-y-3 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleMoveOrder(idx, "UP")}
                          disabled={idx === 0}
                          className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-400 hover:text-white disabled:opacity-20"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleMoveOrder(idx, "DOWN")}
                          disabled={idx === teams.length - 1}
                          className="rounded bg-zinc-800 px-1 text-[10px] text-zinc-400 hover:text-white disabled:opacity-20"
                        >
                          ▼
                        </button>
                      </div>

                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-800 font-mono text-xs font-bold text-emerald-400">
                        #{team.draftOrder}
                      </div>

                      <div>
                        <h4 className="font-bold text-white text-sm">{team.teamName}</h4>
                        <span className="text-[10px] text-zinc-500">
                          {team.picks?.length || 0} Picks Made · {teamProtections.length} Locked Protections
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-[170px]">
                        <label className="block text-[10px] text-zinc-400">Head Coach</label>
                        <select
                          value={team.headCoachUserId || team.headCoach?.id || ""}
                          onChange={(e) => handleUpdateCoach(team.id, "HEAD", e.target.value)}
                          className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                        >
                          <option value="">-- No Head Coach --</option>
                          {availableCoaches.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name || c.email}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="min-w-[170px]">
                        <label className="block text-[10px] text-zinc-400">Assistant Coach</label>
                        <select
                          value={team.assistantUserId || team.assistantCoach?.id || ""}
                          onChange={(e) => handleUpdateCoach(team.id, "ASSISTANT", e.target.value)}
                          className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                        >
                          <option value="">-- No Assistant --</option>
                          {availableCoaches.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name || c.email}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => handleDeleteTeam(team.id)}
                        disabled={(team.picks?.length || 0) > 0}
                        title={(team.picks?.length || 0) > 0 ? "Cannot delete team with picks" : "Delete Team"}
                        className="mt-3 rounded p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-20"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Protections / Linked Players List */}
                  <div className="rounded-lg bg-zinc-900/60 p-3 border border-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                        <span>🔒</span> Coach-Linked Players & Lock Rounds
                      </span>
                      {addingProtectionTeamId !== team.id && (
                        <button
                          onClick={() => {
                            setAddingProtectionTeamId(team.id);
                            setNewChildName("");
                            setNewChildRound(teamProtections.length + 1);
                          }}
                          className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
                        >
                          + Add Linked Player Protection
                        </button>
                      )}
                    </div>

                    {teamProtections.length === 0 && addingProtectionTeamId !== team.id ? (
                      <div className="text-[11px] text-zinc-500 italic">
                        No linked players configured for this team. All rounds are open for live drafting.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {teamProtections.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded bg-zinc-950 px-2.5 py-1.5 border border-zinc-800 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              {p.protectionType === "RETURNING_PLAYER" && (
                                <span title="Returning Player">🏠</span>
                              )}
                              <span className="font-bold text-emerald-400">{p.playerName}</span>
                              <span className="text-[10px] text-zinc-400">
                                ({protectionTypeLabel(p.protectionType)})
                              </span>
                              {p.isClaimed && (
                                <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                                  Claimed
                                </span>
                              )}
                              {p.isOverridden && (
                                <span
                                  className="rounded bg-rose-500/20 px-1.5 py-0.2 text-[9px] font-bold text-rose-300"
                                  title="Auto-lock is disabled for this protection -- it won't be auto-drafted. Usually set automatically after an undo."
                                >
                                  Auto-Lock Disabled
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-zinc-400">Auto-load Round:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  key={`${p.id}-${p.protectedRound}`}
                                  defaultValue={p.protectedRound}
                                  onBlur={(e) => {
                                    const round = parseInt(e.target.value, 10) || 1;
                                    if (round !== p.protectedRound) handleUpdateProtectionRound(p.id, round);
                                  }}
                                  className="w-14 rounded bg-zinc-900 border border-zinc-700 px-1 py-0.5 text-center font-mono font-bold text-amber-400"
                                />
                              </div>
                              <button
                                onClick={() => handleToggleProtectionOverride(p.id, !p.isOverridden)}
                                className={`text-[10px] font-semibold ${
                                  p.isOverridden
                                    ? "text-emerald-400 hover:text-emerald-300"
                                    : "text-zinc-500 hover:text-amber-400"
                                }`}
                                title={
                                  p.isOverridden
                                    ? "Re-enable auto-lock for this protection"
                                    : "Disable auto-lock -- this round will stay open for a manual pick"
                                }
                              >
                                {p.isOverridden ? "Re-enable" : "Disable"}
                              </button>
                              <button
                                onClick={() => handleDeleteProtection(p.id)}
                                className="text-zinc-500 hover:text-rose-400 text-xs"
                                title="Remove protection"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick Add Form */}
                    {addingProtectionTeamId === team.id && (
                      <div className="flex flex-wrap items-center gap-2 rounded bg-zinc-950 p-2 border border-emerald-500/40 mt-2">
                        <select
                          value={newChildName}
                          onChange={(e) => setNewChildName(e.target.value)}
                          className="flex-1 min-w-[150px] rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-white"
                        >
                          <option value="">-- Select player from pool --</option>
                          {linkablePlayers.map((p) => (
                            <option key={p.id} value={p.fullName}>
                              {p.fullName}
                            </option>
                          ))}
                        </select>
                        <select
                          value={newChildRole}
                          onChange={(e) => {
                            const role = e.target.value as typeof newChildRole;
                            setNewChildRole(role);
                            // Returning players default to the last round — the
                            // whole point is they're placed after live drafting,
                            // not competing for an early pick.
                            if (role === "RETURNING_PLAYER") setNewChildRound(totalRounds);
                          }}
                          className="rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-white"
                        >
                          <option value="HEAD_COACH_CHILD">Head Coach Child</option>
                          <option value="ASSISTANT_COACH_CHILD">Assistant Child</option>
                          <option value="RETURNING_PLAYER">Returning Player</option>
                        </select>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-zinc-400">Rd:</span>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={newChildRound}
                            onChange={(e) => setNewChildRound(parseInt(e.target.value) || 1)}
                            className="w-12 rounded bg-zinc-900 border border-zinc-700 px-1 py-1 text-center font-mono font-bold text-amber-400 text-xs"
                          />
                        </div>
                        <button
                          onClick={() => handleAddProtection(team.id)}
                          className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-500"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setAddingProtectionTeamId(null)}
                          className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end border-t border-zinc-800 pt-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
