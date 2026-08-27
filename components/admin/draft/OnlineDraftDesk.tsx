"use client";

import { useEffect, useState } from "react";
import CoachPairingDesk, { CoachPairing } from "./CoachPairingDesk";
import LiveDraftRoom from "./LiveDraftRoom";
import type { ContentOrgId } from "@/lib/siteConfig";

type DraftSessionItem = {
  id: string;
  name: string;
  ageGroup: string;
  seasonYear: number;
  status: string;
  draftType: string;
  _count: { playerPool: number; picks: number };
  teams: { id: string; teamName: string; headCoach?: { name: string | null } | null }[];
};

type Props = {
  targetOrg: ContentOrgId;
  seasonYear: number;
};

export default function OnlineDraftDesk({ targetOrg, seasonYear }: Props) {
  const [sessions, setSessions] = useState<DraftSessionItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"LIST" | "CREATE" | "ROOM">("LIST");

  // Create Session Form State
  const [draftName, setDraftName] = useState("");
  const [ageGroups, setAgeGroups] = useState<string[]>(["10 year-old", "9 year-old", "11-12 year-olds"]);
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("10 year-old");
  const [draftType, setDraftType] = useState<"SNAKE" | "LINEAR">("SNAKE");
  const [secondsPerPick, setSecondsPerPick] = useState(120);
  const [totalRounds, setTotalRounds] = useState(12);
  const [teamNamesInput, setTeamNamesInput] = useState("Yankees\nRed Sox\nDodgers\nCubs");
  const [seedFromRegistered, setSeedFromRegistered] = useState(true);
  const [registeredPlayerCount, setRegisteredPlayerCount] = useState(0);

  const [pairings, setPairings] = useState<CoachPairing[]>([]);
  const [availableCoaches, setAvailableCoaches] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [suggestedMatches, setSuggestedMatches] = useState<any[]>([]);
  const [contextLoading, setContextLoading] = useState(false);

  const parsedTeamNames = teamNamesInput
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/draft/sessions?organizationId=${targetOrg}&seasonYear=${seasonYear}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (e) {
      console.error("Failed to load draft sessions", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSetupContext = async (ageGroup: string) => {
    setContextLoading(true);
    try {
      const res = await fetch(
        `/api/admin/draft/sessions?mode=setup-context&organizationId=${targetOrg}&seasonYear=${seasonYear}&ageGroup=${encodeURIComponent(ageGroup)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.ageGroups && data.ageGroups.length > 0) {
          setAgeGroups(data.ageGroups);
        }
        setAvailableCoaches(data.availableCoaches || []);
        setSuggestedMatches(data.suggestedMatches || []);
        setRegisteredPlayerCount(data.registeredPlayerCount || 0);

        // Adjust default team count based on player count
        const count = data.registeredPlayerCount || 0;
        if (count > 0) {
          const estimatedTeams = Math.max(3, Math.ceil(count / 12));
          const defaultNames = ["Yankees", "Red Sox", "Dodgers", "Cubs", "Braves", "Astros", "Giants", "Cardinals", "Phillies", "Mets"];
          setTeamNamesInput(defaultNames.slice(0, estimatedTeams).join("\n"));
        }
      }
    } catch (e) {
      console.error("Failed to load setup context", e);
    } finally {
      setContextLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [targetOrg, seasonYear]);

  useEffect(() => {
    if (viewMode === "CREATE") {
      fetchSetupContext(selectedAgeGroup);
    }
  }, [viewMode, selectedAgeGroup, targetOrg, seasonYear]);

  const handleStartCreate = (ageGroup: string = "10 year-old") => {
    setSelectedAgeGroup(ageGroup);
    setDraftName(`${seasonYear} ${ageGroup} Draft`);
    setPairings([]);
    setViewMode("CREATE");
  };

  const handleCreateSession = async () => {
    if (!draftName.trim() || parsedTeamNames.length === 0) {
      alert("Please enter a draft name and at least one team name.");
      return;
    }

    try {
      const res = await fetch("/api/admin/draft/sessions", {
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
          teamNames: parsedTeamNames,
          pairings,
          seedFromRegisteredPlayers: seedFromRegistered,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create draft session");
      }
      const data = await res.json();
      await fetchSessions();
      setSelectedSessionId(data.session.id);
      setViewMode("ROOM");
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            🏆 Online Draft Module
          </h3>
          <p className="text-xs text-zinc-400">
            Manage live snake/linear drafts for {targetOrg} ({seasonYear})
          </p>
        </div>

        <div className="flex items-center gap-2">
          {viewMode !== "LIST" && (
            <button
              onClick={() => {
                setViewMode("LIST");
                setSelectedSessionId(null);
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
            >
              ← Back to Sessions List
            </button>
          )}

          {viewMode === "LIST" && (
            <button
              onClick={() => handleStartCreate("10 year-old")}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-lg"
            >
              + Create New Draft Session
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: SESSIONS LIST */}
      {viewMode === "LIST" && (
        <div>
          {loading ? (
            <div className="p-8 text-center text-zinc-500">Loading draft sessions...</div>
          ) : sessions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3 hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/20">
                      {sess.ageGroup}
                    </span>
                    <span
                      className={`text-xs font-mono px-2 py-0.5 rounded ${
                        sess.status === "LIVE"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse font-bold"
                          : sess.status === "COMPLETED" || sess.status === "MATERIALIZED"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {sess.status}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-white">{sess.name}</h4>
                    <p className="text-xs text-zinc-400">
                      {sess.teams.length} Teams · {sess._count.playerPool} Players in Pool · {sess._count.picks} Picks Made
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedSessionId(sess.id);
                      setViewMode("ROOM");
                    }}
                    className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow"
                  >
                    Enter Draft Room ➔
                  </button>
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
                + Create First Draft Session (10U)
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
                  onChange={(e) => setDraftType(e.target.value as any)}
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
                  min={30}
                  max={600}
                  step={15}
                  value={secondsPerPick}
                  onChange={(e) => setSecondsPerPick(parseInt(e.target.value) || 120)}
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
                  placeholder="Yankees&#10;Red Sox&#10;Dodgers&#10;Cubs"
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
            pairings={pairings}
            onUpdatePairings={setPairings}
          />

          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="text-xs text-zinc-400">
              {parsedTeamNames.length} Teams · {pairings.length} Coach Protections · {seedFromRegistered ? registeredPlayerCount : 0} Pool Players
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
          onMaterializeComplete={() => {
            alert("Teams materialized successfully! Redirecting to Teams Management list.");
            setViewMode("LIST");
            fetchSessions();
          }}
        />
      )}
    </div>
  );
}
