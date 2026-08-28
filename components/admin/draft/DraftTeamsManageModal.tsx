"use client";

import { useEffect, useState } from "react";

type CoachOption = {
  id: string;
  name: string | null;
  email: string;
};

type DraftTeam = {
  id: string;
  teamName: string;
  draftOrder: number;
  headCoachUserId?: string | null;
  assistantUserId?: string | null;
  headCoach?: { id: string; name: string | null; email: string } | null;
  assistantCoach?: { id: string; name: string | null; email: string } | null;
  picks?: any[];
};

type Props = {
  sessionId: string;
  availableCoaches: CoachOption[];
  onClose: () => void;
  onUpdated: () => void;
};

export default function DraftTeamsManageModal({
  sessionId,
  availableCoaches,
  onClose,
  onUpdated,
}: Props) {
  const [teams, setTeams] = useState<DraftTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState("");
  const [addingTeam, setAddingTeam] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/teams`);
      const data = await res.json();
      if (data.teams) {
        setTeams(data.teams);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, [sessionId]);

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
      fetchTeams();
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAddingTeam(false);
    }
  };

  const handleUpdateCoach = async (teamId: string, role: "HEAD" | "ASSISTANT", userId: string) => {
    try {
      const body: any = { teamId };
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
      fetchTeams();
      onUpdated();
    } catch (e: any) {
      setError(e.message);
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
      fetchTeams();
      onUpdated();
    } catch (e: any) {
      setError(e.message);
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
      fetchTeams();
      onUpdated();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white">🛡️ Manage Draft Teams & Order</h3>
            <p className="text-xs text-zinc-400">Reorder draft positions, assign coaches, and add/remove teams</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
            {error}
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
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="p-8 text-center text-xs text-zinc-500 animate-pulse">Loading draft teams...</div>
          ) : teams.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">No teams configured in this draft session.</div>
          ) : (
            teams.map((team, idx) => (
              <div
                key={team.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 hover:border-zinc-700 transition-colors"
              >
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
                      {team.picks?.length || 0} Picks Made
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-[160px]">
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

                  <div className="min-w-[160px]">
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
            ))
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
