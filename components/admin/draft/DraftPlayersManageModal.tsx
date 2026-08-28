"use client";

import { useEffect, useState } from "react";
import type { DraftPlayerPoolItem } from "@/lib/draft/types";
import { getErrorMessage } from "@/lib/draft/clientError";

type DraftPlayer = DraftPlayerPoolItem;

type Props = {
  sessionId: string;
  onClose: () => void;
  onUpdated: () => void;
};

export default function DraftPlayersManageModal({
  sessionId,
  onClose,
  onUpdated,
}: Props) {
  const [players, setPlayers] = useState<DraftPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Add / Edit form state
  const [editingPlayer, setEditingPlayer] = useState<DraftPlayer | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [evaluationScore, setEvaluationScore] = useState("");
  const [pitcherRating, setPitcherRating] = useState("");
  const [catcherRating, setCatcherRating] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPlayers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/players`);
      const data = await res.json();
      if (data.players) {
        setPlayers(data.players);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, [sessionId]);

  const resetForm = () => {
    setEditingPlayer(null);
    setShowAddForm(false);
    setFirstName("");
    setLastName("");
    setGuardianEmail("");
    setGuardianPhone("");
    setEvaluationScore("");
    setPitcherRating("");
    setCatcherRating("");
    setNotes("");
  };

  const startEdit = (player: DraftPlayer) => {
    setEditingPlayer(player);
    setShowAddForm(true);
    setFirstName(player.firstName || "");
    setLastName(player.lastName || "");
    setGuardianEmail(player.guardianEmail || "");
    setGuardianPhone(player.guardianPhone || "");
    setEvaluationScore(player.evaluationScore ? String(player.evaluationScore) : "");
    setPitcherRating(player.pitcherRating ? String(player.pitcherRating) : "");
    setCatcherRating(player.catcherRating ? String(player.catcherRating) : "");
    setNotes(player.notes || "");
  };

  const handleSavePlayer = async () => {
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!fullName) {
      setError("First or Last Name is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingPlayer) {
        // Update
        const res = await fetch(`/api/admin/draft/sessions/${sessionId}/players`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: editingPlayer.id,
            firstName: firstName.trim() || null,
            lastName: lastName.trim() || null,
            fullName,
            guardianEmail: guardianEmail.trim() || null,
            guardianPhone: guardianPhone.trim() || null,
            evaluationScore: evaluationScore ? parseFloat(evaluationScore) : null,
            pitcherRating: pitcherRating ? parseInt(pitcherRating, 10) : null,
            catcherRating: catcherRating ? parseInt(catcherRating, 10) : null,
            notes: notes.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update player");
        }
      } else {
        // Create
        const res = await fetch(`/api/admin/draft/sessions/${sessionId}/players`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: firstName.trim() || null,
            lastName: lastName.trim() || null,
            fullName,
            guardianEmail: guardianEmail.trim() || null,
            guardianPhone: guardianPhone.trim() || null,
            evaluationScore: evaluationScore ? parseFloat(evaluationScore) : null,
            pitcherRating: pitcherRating ? parseInt(pitcherRating, 10) : null,
            catcherRating: catcherRating ? parseInt(catcherRating, 10) : null,
            notes: notes.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to add player");
        }
      }

      resetForm();
      fetchPlayers();
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!confirm("Are you sure you want to remove this player from the draft pool?")) return;
    try {
      const res = await fetch(
        `/api/admin/draft/sessions/${sessionId}/players?playerId=${playerId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete player");
      }
      fetchPlayers();
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const filteredPlayers = players.filter(
    (p) =>
      p.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (p.guardianEmail && p.guardianEmail.toLowerCase().includes(search.toLowerCase())) ||
      (p.notes && p.notes.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white">🏃 Draft Player Pool Management</h3>
            <p className="text-xs text-zinc-400">
              Add walk-up players, adjust evaluation scores & ratings, and manage pool ({players.length} Total)
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
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
            {error}
          </div>
        )}

        {/* Action Header / Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <input
            type="text"
            placeholder="Search players by name, email, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-white focus:border-emerald-500"
          />

          <button
            onClick={() => {
              resetForm();
              setShowAddForm(true);
            }}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow"
          >
            + Add Walk-up / Late Player
          </button>
        </div>

        {/* Add / Edit Player Drawer/Form */}
        {showAddForm && (
          <div className="rounded-xl border border-emerald-500/30 bg-zinc-950 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h4 className="text-sm font-bold text-emerald-400">
                {editingPlayer ? `✏️ Edit Player: ${editingPlayer.fullName}` : "➕ Add New Player to Draft Pool"}
              </h4>
              <button onClick={resetForm} className="text-xs text-zinc-400 hover:text-white">
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Evaluation Score</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 85.5"
                  value={evaluationScore}
                  onChange={(e) => setEvaluationScore(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Pitcher Rating (1-5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  placeholder="1-5"
                  value={pitcherRating}
                  onChange={(e) => setPitcherRating(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Catcher Rating (1-5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  placeholder="1-5"
                  value={catcherRating}
                  onChange={(e) => setCatcherRating(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Guardian Email</label>
                <input
                  type="email"
                  placeholder="parent@email.com"
                  value={guardianEmail}
                  onChange={(e) => setGuardianEmail(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Guardian Phone</label>
                <input
                  type="text"
                  placeholder="555-123-4567"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Notes / Skills</label>
                <input
                  type="text"
                  placeholder="e.g. Left-handed, Fast"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/60">
              <button
                onClick={resetForm}
                className="rounded px-3 py-1 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlayer}
                disabled={saving}
                className="rounded bg-emerald-600 px-4 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingPlayer ? "Update Player" : "Add Player"}
              </button>
            </div>
          </div>
        )}

        {/* Players Table */}
        <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-xl bg-zinc-950">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 text-[11px] uppercase text-zinc-400">
              <tr>
                <th className="px-3 py-2.5">Player</th>
                <th className="px-3 py-2.5 text-center">Eval Score</th>
                <th className="px-3 py-2.5 text-center">P / C</th>
                <th className="px-3 py-2.5">Guardian Contact</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500 animate-pulse">
                    Loading player pool...
                  </td>
                </tr>
              ) : filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500">
                    No players found.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-zinc-900/50">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-white">{player.fullName}</div>
                      {player.notes && <div className="text-[10px] text-zinc-500">{player.notes}</div>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono font-bold text-amber-400">
                      {player.evaluationScore !== null ? player.evaluationScore.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-center text-[10px] text-zinc-400">
                      {player.pitcherRating ? `P:${player.pitcherRating}` : ""}
                      {player.catcherRating ? ` C:${player.catcherRating}` : ""}
                      {!player.pitcherRating && !player.catcherRating && "—"}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-zinc-400">
                      <div>{player.guardianEmail || "—"}</div>
                      {player.guardianPhone && <div className="text-[10px] text-zinc-500">{player.guardianPhone}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {player.isDrafted ? (
                        <span className="inline-flex rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                          Drafted
                        </span>
                      ) : (
                        <span className="inline-flex rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right space-x-1">
                      <button
                        onClick={() => startEdit(player)}
                        className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePlayer(player.id)}
                        disabled={player.isDrafted}
                        title={player.isDrafted ? "Cannot delete drafted player" : "Delete player"}
                        className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 disabled:opacity-20"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
          <span className="text-xs text-zinc-500">
            {players.filter((p) => !p.isDrafted).length} Available / {players.length} Total Players
          </span>
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
