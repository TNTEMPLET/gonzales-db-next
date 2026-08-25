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
  const [selectedAgeGroup, setSelectedAgeGroup] = useState("10U");
  const [draftType, setDraftType] = useState<"SNAKE" | "LINEAR">("SNAKE");
  const [teamNamesInput, setTeamNamesInput] = useState("Yankees\nRed Sox\nDodgers\nCubs");
  const [pairings, setPairings] = useState<CoachPairing[]>([]);
  const [availableCoaches, setAvailableCoaches] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [suggestedMatches, setSuggestedMatches] = useState<any[]>([]);

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

  useEffect(() => {
    fetchSessions();
  }, [targetOrg, seasonYear]);

  const handleCreateSession = async () => {
    const teamNames = teamNamesInput
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (!draftName.trim() || teamNames.length === 0) {
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
          teamNames,
          coaches: pairings.map((p) => ({
            headCoachUserId: p.role === "HEAD_COACH" ? p.coachUserId : null,
            assistantUserId: p.role === "ASSISTANT_COACH" ? p.coachUserId : null,
          })),
        }),
      });

      if (!res.ok) throw new Error("Failed to create draft session");
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
            🏆 Online Draft Module (ref: onlinedraft.com)
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
              onClick={() => {
                setDraftName(`${seasonYear} ${selectedAgeGroup} Draft`);
                setViewMode("CREATE");
              }}
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
                    <span className="text-xs text-zinc-500 font-mono">{sess.status}</span>
                  </div>

                  <div>
                    <h4 className="text-base font-bold text-white">{sess.name}</h4>
                    <p className="text-xs text-zinc-400">
                      {sess.teams.length} Teams · {sess._count.playerPool} Players in Pool
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedSessionId(sess.id);
                      setViewMode("ROOM");
                    }}
                    className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500"
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
                onClick={() => {
                  setDraftName(`${seasonYear} 10U Draft`);
                  setViewMode("CREATE");
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
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
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Step 1: Draft Session Setup</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Draft Session Name</label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Age Group / Division</label>
                <select
                  value={selectedAgeGroup}
                  onChange={(e) => setSelectedAgeGroup(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                >
                  <option value="6U">6U T-Ball</option>
                  <option value="8U">8U Coach Pitch</option>
                  <option value="10U">10U Minors</option>
                  <option value="12U">12U Majors</option>
                  <option value="14U">14U Juniors</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Draft Type</label>
                <select
                  value={draftType}
                  onChange={(e) => setDraftType(e.target.value as any)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
                >
                  <option value="SNAKE">Snake Draft (1..N, N..1)</option>
                  <option value="LINEAR">Linear Draft (1..N, 1..N)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Teams List (One per line)</label>
                <textarea
                  rows={3}
                  value={teamNamesInput}
                  onChange={(e) => setTeamNamesInput(e.target.value)}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          <CoachPairingDesk
            ageGroup={selectedAgeGroup}
            availableCoaches={availableCoaches}
            suggestedMatches={suggestedMatches}
            pairings={pairings}
            onUpdatePairings={setPairings}
          />

          <div className="flex justify-end">
            <button
              onClick={handleCreateSession}
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 shadow-xl"
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
