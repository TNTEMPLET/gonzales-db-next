"use client";

import { useState } from "react";
import type { CoachPairing, DraftUserRef } from "@/lib/draft/types";
import type { CoachPlayerMatchCandidate } from "@/lib/draft/coachPlayerMatcher";

export type { CoachPairing };

type Props = {
  ageGroup: string;
  teamNames: string[];
  availableCoaches: DraftUserRef[];
  suggestedMatches: CoachPlayerMatchCandidate[];
  pairings: CoachPairing[];
  onUpdatePairings: (pairings: CoachPairing[]) => void;
};

export default function CoachPairingDesk({
  ageGroup,
  teamNames,
  availableCoaches,
  suggestedMatches,
  pairings,
  onUpdatePairings,
}: Props) {
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [protectedRoundInput, setProtectedRoundInput] = useState(1);
  const [roleInput, setRoleInput] = useState<"HEAD_COACH" | "ASSISTANT_COACH">("HEAD_COACH");
  const [selectedTeamInput, setSelectedTeamInput] = useState("");

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
      assignedTeamName: selectedTeamInput || teamNames[pairings.length % Math.max(teamNames.length, 1)] || undefined,
    };

    onUpdatePairings([...pairings, newPairing]);
    setSelectedCoachId("");
    setPlayerNameInput("");
    setSelectedTeamInput("");
  };

  const handleRemovePairing = (index: number) => {
    const updated = pairings.filter((_, i) => i !== index);
    onUpdatePairings(updated);
  };

  const handleAcceptSuggested = (match: (typeof suggestedMatches)[0]) => {
    const defaultTeam = teamNames[pairings.length % Math.max(teamNames.length, 1)] || "";
    const newPairing: CoachPairing = {
      coachUserId: match.coachUserId,
      coachName: match.coachName,
      coachEmail: match.coachEmail,
      playerName: match.playerName,
      guardianEmail: match.coachEmail,
      protectedRound: 1,
      role: "HEAD_COACH",
      assignedTeamName: defaultTeam,
    };

    onUpdatePairings([...pairings, newPairing]);
  };

  const handleTeamChange = (index: number, newTeamName: string) => {
    const updated = [...pairings];
    updated[index] = { ...updated[index], assignedTeamName: newTeamName };
    onUpdatePairings(updated);
  };

  const handleRoundChange = (index: number, round: number) => {
    const updated = [...pairings];
    updated[index] = { ...updated[index], protectedRound: round };
    onUpdatePairings(updated);
  };

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/80 p-6 backdrop-blur-md space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs">
              2
            </span>
            Coach-to-Player Pairing & Child Protections ({ageGroup})
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Assign coaches to draft teams and lock in their protected child draft rounds.
          </p>
        </div>
        <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
          {pairings.length} Active Pairings
        </div>
      </div>

      {/* Suggested Auto-Matches */}
      {suggestedMatches.length > 0 && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              ⚡ Auto-Detected Coach-Child Matches ({suggestedMatches.length})
            </h4>
            <span className="text-[11px] text-amber-300/70">
              Matched from registration contact info
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestedMatches.map((match, idx) => {
              const alreadyLinked = pairings.some(
                (p) => p.coachUserId === match.coachUserId && p.playerName === match.playerName
              );

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-slate-950/70 p-3 border border-slate-800"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-sm font-semibold text-slate-200 truncate">
                      {match.coachName} ➔ <span className="text-emerald-400 font-bold">{match.playerName}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          match.confidence === "HIGH"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {match.confidence}
                      </span>
                      <span className="text-xs text-slate-400 truncate">{match.matchReason}</span>
                    </div>
                  </div>
                  <button
                    disabled={alreadyLinked}
                    onClick={() => handleAcceptSuggested(match)}
                    className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40 disabled:bg-slate-800 disabled:text-slate-500 transition-all shadow"
                  >
                    {alreadyLinked ? "✓ Linked" : "Link Child"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual Link Form */}
      <div className="rounded-lg bg-slate-950/60 p-4 border border-slate-800 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Add Coach Pairing & Protection
        </h4>
        <div className="grid gap-3 sm:grid-cols-12 items-end">
          <div className="sm:col-span-3">
            <label className="block text-xs text-slate-400 mb-1">Select Coach</label>
            <select
              value={selectedCoachId}
              onChange={(e) => setSelectedCoachId(e.target.value)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white focus:border-emerald-500"
            >
              <option value="">-- Choose Registered Coach --</option>
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
            <label className="block text-xs text-slate-400 mb-1">Assign to Team</label>
            <select
              value={selectedTeamInput}
              onChange={(e) => setSelectedTeamInput(e.target.value)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white"
            >
              <option value="">-- Select Team --</option>
              {teamNames.map((t, idx) => (
                <option key={idx} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Role</label>
            <select
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value as CoachPairing["role"])}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white"
            >
              <option value="HEAD_COACH">Head Coach</option>
              <option value="ASSISTANT_COACH">Assistant</option>
            </select>
          </div>

          <div className="sm:col-span-1">
            <label className="block text-xs text-slate-400 mb-1">Lock Rd</label>
            <input
              type="number"
              min={1}
              max={12}
              value={protectedRoundInput}
              onChange={(e) => setProtectedRoundInput(parseInt(e.target.value) || 1)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white text-center"
            />
          </div>

          <div className="sm:col-span-1">
            <button
              onClick={handleAddPairing}
              className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow"
            >
              + Add
            </button>
          </div>
        </div>
      </div>

      {/* Active Pairings Table */}
      {pairings.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/40">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-xs text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2.5">Coach Name</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Assigned Draft Team</th>
                <th className="px-3 py-2.5">Protected Child</th>
                <th className="px-3 py-2.5 text-center">Lock Round</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {pairings.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30">
                  <td className="px-3 py-2.5 font-medium text-white">
                    {p.coachName}
                    <div className="text-[11px] text-slate-500 font-mono">{p.coachEmail}</div>
                  </td>
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
                  <td className="px-3 py-2.5">
                    <select
                      value={p.assignedTeamName || ""}
                      onChange={(e) => handleTeamChange(idx, e.target.value)}
                      className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-white"
                    >
                      <option value="">Unassigned</option>
                      {teamNames.map((t, tIdx) => (
                        <option key={tIdx} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-emerald-400 font-semibold">
                    {p.playerName || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={p.protectedRound}
                      onChange={(e) => handleRoundChange(idx, parseInt(e.target.value) || 1)}
                      className="w-16 rounded bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-center font-mono font-bold text-amber-400"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleRemovePairing(idx)}
                      className="text-xs text-rose-400 hover:text-rose-300 font-medium"
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
        <div className="text-center py-6 text-sm text-slate-500 italic border border-dashed border-slate-800 rounded-lg">
          No coach-player pairings added yet. Link coaches above or accept auto-detected matches.
        </div>
      )}
    </div>
  );
}
