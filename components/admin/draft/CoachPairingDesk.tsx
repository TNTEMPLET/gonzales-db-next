"use client";

import { useState } from "react";

export type CoachPairing = {
  coachUserId: string;
  coachName: string;
  coachEmail: string;
  playerName: string;
  guardianEmail: string | null;
  protectedRound: number;
  role: "HEAD_COACH" | "ASSISTANT_COACH";
};

type Props = {
  ageGroup: string;
  availableCoaches: { id: string; name: string | null; email: string }[];
  suggestedMatches: {
    coachUserId: string;
    coachName: string;
    coachEmail: string;
    playerName: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    matchReason: string;
  }[];
  pairings: CoachPairing[];
  onUpdatePairings: (pairings: CoachPairing[]) => void;
};

export default function CoachPairingDesk({
  ageGroup,
  availableCoaches,
  suggestedMatches,
  pairings,
  onUpdatePairings,
}: Props) {
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [protectedRoundInput, setProtectedRoundInput] = useState(1);
  const [roleInput, setRoleInput] = useState<"HEAD_COACH" | "ASSISTANT_COACH">("HEAD_COACH");

  const handleAddPairing = () => {
    if (!selectedCoachId || !playerNameInput.trim()) return;

    const coach = availableCoaches.find((c) => c.id === selectedCoachId);
    if (!coach) return;

    const newPairing: CoachPairing = {
      coachUserId: coach.id,
      coachName: coach.name || coach.email,
      coachEmail: coach.email,
      playerName: playerNameInput.trim(),
      guardianEmail: coach.email,
      protectedRound: protectedRoundInput,
      role: roleInput,
    };

    onUpdatePairings([...pairings, newPairing]);
    setSelectedCoachId("");
    setPlayerNameInput("");
  };

  const handleRemovePairing = (index: number) => {
    const updated = pairings.filter((_, i) => i !== index);
    onUpdatePairings(updated);
  };

  const handleAcceptSuggested = (match: (typeof suggestedMatches)[0]) => {
    const newPairing: CoachPairing = {
      coachUserId: match.coachUserId,
      coachName: match.coachName,
      coachEmail: match.coachEmail,
      playerName: match.playerName,
      guardianEmail: match.coachEmail,
      protectedRound: 1,
      role: "HEAD_COACH",
    };

    onUpdatePairings([...pairings, newPairing]);
  };

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/80 p-6 backdrop-blur-md">
      <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-sm">
              2
            </span>
            Coach-to-Player Pairing Desk ({ageGroup})
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Link coaches to their children/protected picks before launching the online draft.
          </p>
        </div>
        <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
          {pairings.length} Active Pairings
        </div>
      </div>

      {/* Suggested Auto-Matches */}
      {suggestedMatches.length > 0 && (
        <div className="mb-6 rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-1.5">
            ⚡ Auto-Detected Guardian / Child Matches ({suggestedMatches.length})
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestedMatches.map((match, idx) => {
              const alreadyLinked = pairings.some(
                (p) => p.coachUserId === match.coachUserId && p.playerName === match.playerName
              );

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-slate-950/60 p-3 border border-slate-800"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-sm font-semibold text-slate-200 truncate">
                      {match.coachName} ➔ {match.playerName}
                    </div>
                    <div className="text-xs text-amber-400/80">{match.matchReason}</div>
                  </div>
                  <button
                    disabled={alreadyLinked}
                    onClick={() => handleAcceptSuggested(match)}
                    className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    {alreadyLinked ? "Linked" : "Link Child"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual Link Form */}
      <div className="mb-6 rounded-lg bg-slate-950/60 p-4 border border-slate-800">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Add Custom Coach & Child Lock
        </h4>
        <div className="grid gap-3 sm:grid-cols-12 items-end">
          <div className="sm:col-span-4">
            <label className="block text-xs text-slate-400 mb-1">Select Coach</label>
            <select
              value={selectedCoachId}
              onChange={(e) => setSelectedCoachId(e.target.value)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white focus:border-emerald-500"
            >
              <option value="">-- Choose Coach --</option>
              {availableCoaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs text-slate-400 mb-1">Child / Player Name</label>
            <input
              type="text"
              placeholder="e.g. Johnny Doe"
              value={playerNameInput}
              onChange={(e) => setPlayerNameInput(e.target.value)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white focus:border-emerald-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Role</label>
            <select
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value as any)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white"
            >
              <option value="HEAD_COACH">Head Coach</option>
              <option value="ASSISTANT_COACH">Assistant</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Lock Round</label>
            <input
              type="number"
              min={1}
              max={12}
              value={protectedRoundInput}
              onChange={(e) => setProtectedRoundInput(parseInt(e.target.value) || 1)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white"
            />
          </div>

          <div className="sm:col-span-1">
            <button
              onClick={handleAddPairing}
              className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              + Add
            </button>
          </div>
        </div>
      </div>

      {/* Active Pairings Table */}
      {pairings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-xs text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2">Coach Name</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Child / Player</th>
                <th className="px-3 py-2 text-center">Protected Round</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pairings.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 font-medium text-white">{p.coachName}</td>
                  <td className="px-3 py-2.5 text-xs">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.role === "HEAD_COACH"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                      }`}
                    >
                      {p.role === "HEAD_COACH" ? "Head Coach" : "Assistant"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-emerald-400 font-semibold">{p.playerName}</td>
                  <td className="px-3 py-2.5 text-center font-mono font-bold text-amber-400">
                    Round {p.protectedRound}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleRemovePairing(idx)}
                      className="text-xs text-rose-400 hover:text-rose-300"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-slate-500 italic">
          No coach-player pairings added yet. Link coaches above or accept auto-detected matches.
        </div>
      )}
    </div>
  );
}
