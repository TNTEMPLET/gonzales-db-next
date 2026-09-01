"use client";

import { useEffect, useState } from "react";
import CoachPairingDesk from "./CoachPairingDesk";
import LiveDraftRoom from "./LiveDraftRoom";
import DraftSessionEditModal from "./DraftSessionEditModal";
import DraftTeamsManageModal from "./DraftTeamsManageModal";
import DraftPlayersManageModal from "./DraftPlayersManageModal";
import type { ContentOrgId } from "@/lib/siteConfig";
import type { CoachPairing, DraftLeaderOption, DraftSessionListItem, DraftUserRef } from "@/lib/draft/types";
import type { CoachPlayerMatchCandidate } from "@/lib/draft/coachPlayerMatcher";
import { getErrorMessage } from "@/lib/draft/clientError";
import { STANDARD_DIVISIONS } from "@/lib/sportsConnect/fallballDivisions";

type DraftSessionItem = DraftSessionListItem;

type Props = {
  targetOrg: ContentOrgId;
  seasonYear: number;
};

export default function OnlineDraftDesk({ targetOrg, seasonYear }: Props) {
  const [sessions, setSessions] = useState<DraftSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"LIST" | "CREATE" | "ROOM">("LIST");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Create Session Form State
  const [draftName, setDraftName] = useState("");
  const [ageGroups, setAgeGroups] = useState<string[]>([...STANDARD_DIVISIONS]);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string>(STANDARD_DIVISIONS[0]);
  const [draftType, setDraftType] = useState<"SNAKE" | "LINEAR">("SNAKE");
  const [secondsPerPick, setSecondsPerPick] = useState(120);
  const [totalRounds, setTotalRounds] = useState(12);
  const [draftLeaderUserId, setDraftLeaderUserId] = useState("");
  const [teamNamesInput, setTeamNamesInput] = useState("Yankees\nRed Sox\nDodgers\nCubs");
  const [seedFromRegistered, setSeedFromRegistered] = useState(true);
  const [registeredPlayerCount, setRegisteredPlayerCount] = useState(0);
  const [registeredPlayers, setRegisteredPlayers] = useState<{ id: string; fullName: string }[]>([]);

  const [pairings, setPairings] = useState<CoachPairing[]>([]);
  const [availableCoaches, setAvailableCoaches] = useState<DraftUserRef[]>([]);
  const [availableDraftLeaders, setAvailableDraftLeaders] = useState<DraftLeaderOption[]>([]);
  const [suggestedMatches, setSuggestedMatches] = useState<CoachPlayerMatchCandidate[]>([]);
  const [contextLoading, setContextLoading] = useState(false);

  // Modals for CRUD
  const [editingSession, setEditingSession] = useState<DraftSessionItem | null>(null);
  const [managingTeamsSessionId, setManagingTeamsSessionId] = useState<string | null>(null);
  const [managingPlayersSessionId, setManagingPlayersSessionId] = useState<string | null>(null);

  const parsedTeamNames = teamNamesInput
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/draft/sessions?org=${targetOrg}&seasonYear=${seasonYear}`);
      const data = await res.json();
      if (data.sessions) {
        setSessions(data.sessions);
      }
    } catch (e) {
      console.error("Failed to load sessions:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchContext = async (ageGroup: string) => {
    setContextLoading(true);
    try {
      const res = await fetch(
        `/api/admin/draft/sessions?org=${targetOrg}&seasonYear=${seasonYear}&context=true&ageGroup=${encodeURIComponent(
          ageGroup
        )}`
      );
      const data = await res.json();
      if (data.ageGroups) setAgeGroups(data.ageGroups);
      if (data.availableCoaches) setAvailableCoaches(data.availableCoaches);
      if (data.availableDraftLeaders) setAvailableDraftLeaders(data.availableDraftLeaders);
      if (data.suggestedMatches) setSuggestedMatches(data.suggestedMatches);
      if (data.registeredPlayerCount !== undefined) setRegisteredPlayerCount(data.registeredPlayerCount);
      if (data.registeredPlayers) setRegisteredPlayers(data.registeredPlayers);
    } catch (e) {
      console.error("Failed to load draft context:", e);
    } finally {
      setContextLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchContext(selectedAgeGroup);
  }, [targetOrg, seasonYear]);

  const handleStartCreate = (ageGroup?: string) => {
    setError(null);
    setNotice(null);
    const ag = ageGroup || selectedAgeGroup;
    setSelectedAgeGroup(ag);
    setDraftName(`${seasonYear} ${ag} Draft`);
    fetchContext(ag);
    setViewMode("CREATE");
  };

  const handleCreateSession = async () => {
    setError(null);
    setNotice(null);
    if (!draftName.trim() || parsedTeamNames.length === 0) {
      setError("Please enter draft name and at least one team");
      return;
    }

    try {
      const res = await fetch(`/api/admin/draft/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: targetOrg,
          seasonYear,
          ageGroup: selectedAgeGroup,
          name: draftName,
          draftType,
          secondsPerPick,
          totalRounds,
          draftLeaderUserId: draftLeaderUserId || null,
          teamNames: parsedTeamNames,
          pairings,
          seedFromRegisteredPlayers: seedFromRegistered,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create draft session");
        return;
      }

      const data = await res.json();
      await fetchSessions();
      setSelectedSessionId(data.session.id);
      setViewMode("ROOM");
    } catch (e) {
      setError(`Error creating session: ${getErrorMessage(e)}`);
    }
  };

  const handleDeleteSession = async (sessionId: string, sessionName: string) => {
    if (!confirm(`Are you sure you want to permanently delete draft session: "${sessionName}"?\nAll teams, draft picks, and session records will be deleted.`)) return;
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(`Failed to delete session: ${data.error}`);
        return;
      }
      fetchSessions();
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
        setViewMode("LIST");
      }
    } catch (e) {
      setError(`Error deleting session: ${getErrorMessage(e)}`);
    }
  };

  const handleResetSession = async (sessionId: string, sessionName: string) => {
    if (!confirm(`Reset all picks for "${sessionName}"?\nThis clears all picks and returns players to the available pool.`)) return;
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/reset`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(`Reset failed: ${data.error}`);
        return;
      }
      fetchSessions();
      setNotice("Draft board reset successfully!");
    } catch (e) {
      setError(`Error resetting draft: ${getErrorMessage(e)}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Title & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <span>⚾</span> Online Draft Manager
          </h2>
          <p className="text-xs text-zinc-400">
            Live Snake / Linear drafting, coach-child reservations, draft leader controls, and real-time board
          </p>
        </div>

        <div className="flex items-center gap-2">
          {viewMode !== "LIST" && (
            <button
              onClick={() => {
                setError(null);
                setNotice(null);
                setViewMode("LIST");
              }}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white"
            >
              ← All Drafts
            </button>
          )}
          {viewMode === "LIST" && (
            <button
              onClick={() => handleStartCreate()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow"
            >
              + Create New Draft Session
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300">
          {notice}
        </div>
      )}

      {/* VIEW 1: SESSIONS LIST */}
      {viewMode === "LIST" && (
        <div className="space-y-4">
          {loading ? (
            <div className="rounded-xl border border-zinc-800 p-12 text-center text-zinc-400">
              Loading draft sessions...
            </div>
          ) : sessions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-4 flex flex-col justify-between hover:border-zinc-700 transition-all shadow-lg"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                          {sess.ageGroup}
                        </span>
                        <h4 className="font-bold text-white text-base">{sess.name}</h4>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          sess.status === "LIVE"
                            ? "bg-emerald-500/20 text-emerald-400 animate-pulse border border-emerald-500/30"
                            : sess.status === "COMPLETED" || sess.status === "MATERIALIZED"
                            ? "bg-indigo-500/20 text-indigo-400"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {sess.status}
                      </span>
                    </div>

                    {/* Draft Leader Badge */}
                    <div className="flex items-center gap-1.5 text-xs text-zinc-300 bg-zinc-950/80 rounded-lg p-2 border border-zinc-800/80">
                      <span className="text-indigo-400 font-bold">🎖️ Leader:</span>
                      <span className="truncate font-medium">
                        {sess.draftLeader?.name || sess.draftLeader?.email || "Super Admin"}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-zinc-950 p-2.5 text-center text-xs border border-zinc-800/60">
                      <div>
                        <div className="font-mono font-bold text-white">{sess.teams.length}</div>
                        <div className="text-[10px] text-zinc-500 uppercase">Teams</div>
                      </div>
                      <div>
                        <div className="font-mono font-bold text-emerald-400">{sess._count.playerPool}</div>
                        <div className="text-[10px] text-zinc-500 uppercase">Pool</div>
                      </div>
                      <div>
                        <div className="font-mono font-bold text-amber-400">{sess._count.picks}</div>
                        <div className="text-[10px] text-zinc-500 uppercase">Picks</div>
                      </div>
                    </div>

                    {/* Teams summary */}
                    <div className="flex flex-wrap gap-1">
                      {sess.teams.map((t) => (
                        <span
                          key={t.id}
                          className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300 font-medium"
                        >
                          #{t.draftOrder} {t.teamName}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="space-y-2 border-t border-zinc-800 pt-3">
                    <button
                      onClick={() => {
                        setSelectedSessionId(sess.id);
                        setViewMode("ROOM");
                      }}
                      className="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white hover:bg-emerald-500 shadow-lg transition-all"
                    >
                      🚀 Enter Draft Room ➔
                    </button>

                    <div className="grid grid-cols-4 gap-1">
                      <button
                        onClick={() => setEditingSession(sess)}
                        className="rounded-lg bg-zinc-800 px-2 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white text-center"
                        title="Edit Session & Leader"
                      >
                        ⚙️ Edit
                      </button>
                      <button
                        onClick={() => setManagingTeamsSessionId(sess.id)}
                        className="rounded-lg bg-zinc-800 px-2 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white text-center"
                        title="Manage Teams & Draft Order"
                      >
                        🛡️ Teams
                      </button>
                      <button
                        onClick={() => setManagingPlayersSessionId(sess.id)}
                        className="rounded-lg bg-zinc-800 px-2 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white text-center"
                        title="Manage Draft Player Pool"
                      >
                        👥 Pool
                      </button>
                      <button
                        onClick={() => handleResetSession(sess.id, sess.name)}
                        className="rounded-lg bg-zinc-800 px-2 py-1.5 text-[11px] font-semibold text-amber-400 hover:bg-amber-500/20 text-center"
                        title="Reset Draft Picks"
                      >
                        🔄 Reset
                      </button>
                    </div>

                    <button
                      onClick={() => handleDeleteSession(sess.id, sess.name)}
                      className="w-full text-center text-[10px] text-zinc-500 hover:text-rose-400 py-1 transition-colors"
                    >
                      🗑️ Delete Draft Session
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center space-y-3">
              <div className="text-3xl">⚾</div>
              <h4 className="text-base font-bold text-white">No Draft Sessions Found</h4>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                No online drafts created for {targetOrg} in {seasonYear}. Click below to configure coach-player links and launch a new draft session.
              </p>
              <button
                onClick={() => handleStartCreate("10 year-old")}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow"
              >
                + Create First Draft Session
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: CREATE SESSION & COACH PAIRING */}
      {viewMode === "CREATE" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400 font-bold text-xs">
                  1
                </span>
                Draft Session Configuration
              </h3>
              {contextLoading && (
                <span className="text-xs text-zinc-400 animate-pulse">Loading division info...</span>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Division / Age Group</label>
                <select
                  value={selectedAgeGroup}
                  onChange={(e) => {
                    const group = e.target.value;
                    setSelectedAgeGroup(group);
                    setDraftName(`${seasonYear} ${group} Draft`);
                    fetchContext(group);
                  }}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500"
                >
                  {ageGroups.map((ag, idx) => (
                    <option key={idx} value={ag}>
                      {ag}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Draft Session Name</label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Draft Format</label>
                <select
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value as "SNAKE" | "LINEAR")}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500"
                >
                  <option value="SNAKE">Snake Draft (1..N, N..1, 1..N)</option>
                  <option value="LINEAR">Linear Draft (1..N, 1..N)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Timer (Seconds / Pick)</label>
                <input
                  type="number"
                  min={0}
                  max={600}
                  step={15}
                  value={secondsPerPick}
                  onChange={(e) => setSecondsPerPick(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>

            {/* Draft Leader Assignment & Total Rounds */}
            <div className="grid gap-4 md:grid-cols-2 pt-2 border-t border-zinc-800/60">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  🎖️ Assign Draft Leader (Admin Rights)
                </label>
                <select
                  value={draftLeaderUserId}
                  onChange={(e) => setDraftLeaderUserId(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500"
                >
                  <option value="">-- No Draft Leader Assigned (Admin Only) --</option>
                  {availableDraftLeaders.map((dl) => (
                    <option key={dl.id} value={dl.id}>
                      {dl.name || dl.email} {dl.isBoardMember ? "★ (Board Member)" : dl.isCoach ? "(Coach)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Draft Leaders can make picks on behalf of coaches, pause timers, and manage/undo picks on the live board.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Total Draft Rounds</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={totalRounds}
                  onChange={(e) => setTotalRounds(parseInt(e.target.value) || 12)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 pt-2 border-t border-zinc-800/60">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Draft Teams ({parsedTeamNames.length} Teams) · One name per line
                </label>
                <textarea
                  rows={4}
                  value={teamNamesInput}
                  onChange={(e) => setTeamNamesInput(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs font-mono text-white focus:border-emerald-500"
                  placeholder="Yankees\nRed Sox\nDodgers\nCubs"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-medium text-zinc-300">
                  Player Pool Seeding
                </label>
                <div className="rounded-lg bg-zinc-950/80 border border-zinc-800 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="seedPlayers"
                      checked={seedFromRegistered}
                      onChange={(e) => setSeedFromRegistered(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="seedPlayers" className="text-sm font-semibold text-white cursor-pointer">
                      Auto-seed {registeredPlayerCount} registered players
                    </label>
                  </div>
                  <p className="text-xs text-zinc-400 pl-6">
                    Copies registered players in <span className="text-emerald-400 font-bold">{selectedAgeGroup}</span> into the draft player pool.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <CoachPairingDesk
            ageGroup={selectedAgeGroup}
            teamNames={parsedTeamNames}
            availableCoaches={availableCoaches}
            suggestedMatches={suggestedMatches}
            registeredPlayers={registeredPlayers}
            pairings={pairings}
            onUpdatePairings={setPairings}
          />

          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="text-xs text-zinc-400">
              {parsedTeamNames.length} Teams · {pairings.length} Coach Reservations · {seedFromRegistered ? registeredPlayerCount : 0} Pool Players
            </div>
            <button
              onClick={handleCreateSession}
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 shadow-xl transition-all"
            >
              🚀 Save & Launch Draft Room
            </button>
          </div>
        </div>
      )}

      {/* VIEW 3: LIVE DRAFT ROOM */}
      {viewMode === "ROOM" && selectedSessionId && (
        <LiveDraftRoom
          sessionId={selectedSessionId}
          onBack={() => {
            setViewMode("LIST");
            fetchSessions();
          }}
          onMaterializeComplete={() => {
            setNotice("Teams materialized successfully! Redirecting to Teams Management list.");
            setViewMode("LIST");
            fetchSessions();
          }}
        />
      )}

      {/* MODALS */}
      {editingSession && (
        <DraftSessionEditModal
          session={editingSession}
          availableDraftLeaders={availableDraftLeaders}
          onClose={() => setEditingSession(null)}
          onSaved={() => {
            fetchSessions();
            setEditingSession(null);
          }}
        />
      )}

      {managingTeamsSessionId && (
        <DraftTeamsManageModal
          sessionId={managingTeamsSessionId}
          availableCoaches={availableCoaches}
          totalRounds={
            sessions.find((s) => s.id === managingTeamsSessionId)?.totalRounds || 12
          }
          onClose={() => setManagingTeamsSessionId(null)}
          onUpdated={fetchSessions}
        />
      )}

      {managingPlayersSessionId && (
        <DraftPlayersManageModal
          sessionId={managingPlayersSessionId}
          onClose={() => setManagingPlayersSessionId(null)}
          onUpdated={fetchSessions}
        />
      )}
    </div>
  );
}
