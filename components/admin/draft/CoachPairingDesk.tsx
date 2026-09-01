"use client";

import { useState } from "react";
import type { CoachPairing, DraftCoachOption } from "@/lib/draft/types";
import type { CoachPlayerMatchCandidate } from "@/lib/draft/coachPlayerMatcher";

export type { CoachPairing };

type Props = {
  ageGroup: string;
  teamNames: string[];
  availableCoaches: DraftCoachOption[];
  suggestedMatches: CoachPlayerMatchCandidate[];
  registeredPlayers: { id: string; fullName: string }[];
  pairings: CoachPairing[];
  onUpdatePairings: (pairings: CoachPairing[]) => void;
};

export default function CoachPairingDesk({
  ageGroup,
  teamNames,
  availableCoaches,
  suggestedMatches,
  registeredPlayers,
  pairings,
  onUpdatePairings,
}: Props) {
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [protectedRoundInput, setProtectedRoundInput] = useState(1);
  const [roleInput, setRoleInput] = useState<"HEAD_COACH" | "ASSISTANT_COACH">("HEAD_COACH");
  const [selectedTeamInput, setSelectedTeamInput] = useState("");

  const unassignedCoaches = availableCoaches.filter(
    (c) => !pairings.some((p) => p.coachUserId === c.id)
  );

  const linkedPlayerNames = new Set(pairings.filter((p) => p.playerName).map((p) => p.playerName));
  const linkablePlayers = registeredPlayers.filter((p) => !linkedPlayerNames.has(p.fullName));

  /**
   * Adds a pairing, but if this coach already has a team-only placeholder
   * row (assigned to a team, no linked child yet), fills that row in
   * instead of creating a second row for the same coach.
   */
  const addOrMergePairing = (incoming: CoachPairing) => {
    const placeholderIdx = pairings.findIndex(
      (p) => p.coachUserId === incoming.coachUserId && !p.playerName
    );
    if (placeholderIdx !== -1) {
      const updated = [...pairings];
      updated[placeholderIdx] = { ...updated[placeholderIdx], ...incoming };
      onUpdatePairings(updated);
    } else {
      onUpdatePairings([...pairings, incoming]);
    }
  };

  const handleAddPairing = () => {
    if (!selectedCoachId) return;

    const coach = availableCoaches.find((c) => c.id === selectedCoachId);
    if (!coach) return;

    addOrMergePairing({
      coachUserId: coach.id,
      coachName: coach.name || coach.email,
      coachEmail: coach.email,
      playerName: playerNameInput.trim() || undefined,
      guardianEmail: coach.email,
      protectedRound: protectedRoundInput,
      role: roleInput,
      assignedTeamName: selectedTeamInput || teamNames[pairings.length % Math.max(teamNames.length, 1)] || undefined,
    });
    setSelectedCoachId("");
    setPlayerNameInput("");
    setSelectedTeamInput("");
  };

  const handleRemovePairing = (index: number) => {
    const updated = pairings.filter((_, i) => i !== index);
    onUpdatePairings(updated);
  };

  const handleAcceptSuggested = (match: (typeof suggestedMatches)[0]) => {
    const existing = pairings.find((p) => p.coachUserId === match.coachUserId);
    const defaultTeam = teamNames[pairings.length % Math.max(teamNames.length, 1)] || "";

    addOrMergePairing({
      coachUserId: match.coachUserId,
      coachName: match.coachName,
      coachEmail: match.coachEmail,
      playerName: match.playerName,
      guardianEmail: match.coachEmail,
      protectedRound: existing?.protectedRound ?? protectedRoundInput,
      role: existing?.role ?? "HEAD_COACH",
      assignedTeamName: existing?.assignedTeamName || defaultTeam,
    });
  };

  /**
   * Fills every team's Head Coach and then Assistant Coach slot from the
   * unassigned coach list. Any coach with a detected linked child gets that
   * child auto-attached at the current Reserved Round; coaches with no
   * linked child are still assigned to a team, just with nothing reserved
   * — that round stays open to draft normally for their team.
   */
  const handleAssignAllCoaches = () => {
    if (unassignedCoaches.length === 0 || teamNames.length === 0) return;

    const teamHasHead = new Set(
      pairings.filter((p) => p.role === "HEAD_COACH" && p.assignedTeamName).map((p) => p.assignedTeamName)
    );
    const teamHasAssistant = new Set(
      pairings.filter((p) => p.role === "ASSISTANT_COACH" && p.assignedTeamName).map((p) => p.assignedTeamName)
    );

    const buildPairing = (coachId: string, teamName: string, role: CoachPairing["role"]): CoachPairing => {
      const coach = availableCoaches.find((c) => c.id === coachId)!;
      const match = suggestedMatches.find((m) => m.coachUserId === coachId);
      return {
        coachUserId: coach.id,
        coachName: coach.name || coach.email,
        coachEmail: coach.email,
        playerName: match?.playerName,
        guardianEmail: match?.coachEmail ?? coach.email,
        protectedRound: protectedRoundInput,
        role,
        assignedTeamName: teamName,
      };
    };

    const queue = [...unassignedCoaches];
    const newPairings: CoachPairing[] = [];

    for (const teamName of teamNames) {
      if (queue.length === 0) break;
      if (!teamHasHead.has(teamName)) {
        const coach = queue.shift()!;
        newPairings.push(buildPairing(coach.id, teamName, "HEAD_COACH"));
        teamHasHead.add(teamName);
      }
    }
    for (const teamName of teamNames) {
      if (queue.length === 0) break;
      if (!teamHasAssistant.has(teamName)) {
        const coach = queue.shift()!;
        newPairings.push(buildPairing(coach.id, teamName, "ASSISTANT_COACH"));
        teamHasAssistant.add(teamName);
      }
    }

    if (newPairings.length > 0) {
      onUpdatePairings([...pairings, ...newPairings]);
    }
  };

  const handleTeamChange = (index: number, newTeamName: string) => {
    const updated = [...pairings];
    updated[index] = { ...updated[index], assignedTeamName: newTeamName };
    onUpdatePairings(updated);
  };

  const handleRoleChange = (index: number, role: CoachPairing["role"]) => {
    const updated = [...pairings];
    updated[index] = { ...updated[index], role };
    onUpdatePairings(updated);
  };

  const handleRoundChange = (index: number, round: number) => {
    const updated = [...pairings];
    updated[index] = { ...updated[index], protectedRound: round };
    onUpdatePairings(updated);
  };

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/80 p-6 backdrop-blur-md space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs">
              2
            </span>
            Coach-to-Team Assignments & Reservations ({ageGroup})
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Assign every coach to a draft team. If a coach has a linked child, it auto-loads at the round below —
            coaches with no linked child leave that round open to draft normally.
          </p>
        </div>
        <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
          {pairings.length} Coaches Assigned
        </div>
      </div>

      {/* Global Protection Round + Bulk Assign */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-950/60 p-4 border border-slate-800">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-300">
            Reserved Round for Coaches&apos; Linked Children
          </label>
          <input
            type="number"
            min={1}
            max={12}
            value={protectedRoundInput}
            onChange={(e) => setProtectedRoundInput(parseInt(e.target.value) || 1)}
            className="w-16 rounded-md bg-slate-900 border border-slate-700 px-2 py-1 text-sm text-white text-center font-mono font-bold text-amber-400"
          />
          <span className="text-[11px] text-slate-500">Applies to new assignments below (editable per-row after).</span>
        </div>
        <button
          onClick={handleAssignAllCoaches}
          disabled={unassignedCoaches.length === 0 || teamNames.length === 0}
          title={unassignedCoaches.length === 0 ? "All coaches are already assigned" : "Assign every remaining coach to an open Head/Assistant slot"}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed shadow"
        >
          ⚡ Assign All Coaches ({unassignedCoaches.length} Remaining)
        </button>
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
                (p) => p.coachUserId === match.coachUserId && p.playerName
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

      {/* Manual Assign Form */}
      <div className="rounded-lg bg-slate-950/60 p-4 border border-slate-800 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Assign One Coach to a Team
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
            <label className="block text-xs text-slate-400 mb-1">Child / Player Name (optional)</label>
            <select
              value={playerNameInput}
              onChange={(e) => setPlayerNameInput(e.target.value)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-1.5 text-sm text-white focus:border-emerald-500"
            >
              <option value="">-- No reservation --</option>
              {linkablePlayers.map((p) => (
                <option key={p.id} value={p.fullName}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
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
            <button
              onClick={handleAddPairing}
              disabled={!selectedCoachId}
              className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed shadow"
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
                <th className="px-3 py-2.5">Reserved Child</th>
                <th className="px-3 py-2.5 text-center">Reserved Round</th>
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
                  <td className="px-3 py-2.5">
                    <select
                      value={p.role}
                      onChange={(e) => handleRoleChange(idx, e.target.value as CoachPairing["role"])}
                      className={`rounded px-2 py-1 text-[10px] font-bold border ${
                        p.role === "HEAD_COACH"
                          ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                          : "bg-purple-500/20 text-purple-400 border-purple-500/30"
                      }`}
                    >
                      <option value="HEAD_COACH">Head Coach</option>
                      <option value="ASSISTANT_COACH">Assistant</option>
                    </select>
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
                  <td className="px-3 py-2.5">
                    {p.playerName ? (
                      <span className="text-emerald-400 font-semibold">{p.playerName}</span>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic">None — round open to draft</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={p.protectedRound}
                      onChange={(e) => handleRoundChange(idx, parseInt(e.target.value) || 1)}
                      disabled={!p.playerName}
                      title={!p.playerName ? "No linked child — round stays open to draft" : undefined}
                      className="w-16 rounded bg-slate-900 border border-slate-700 px-1 py-0.5 text-xs text-center font-mono font-bold text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed"
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
          No coaches assigned yet. Use &quot;Assign All Coaches&quot; above, add one manually, or accept an
          auto-detected match.
        </div>
      )}
    </div>
  );
}
