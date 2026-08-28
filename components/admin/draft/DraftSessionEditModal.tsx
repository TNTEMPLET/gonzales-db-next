"use client";

import { useState } from "react";

type DraftLeaderOption = {
  id: string;
  name: string | null;
  email: string;
  isBoardMember?: boolean;
  isCoach?: boolean;
};

type Props = {
  session: {
    id: string;
    name: string;
    ageGroup: string;
    draftType: string;
    status: string;
    secondsPerPick: number | null;
    totalRounds: number;
    draftLeaderUserId?: string | null;
    draftLeader?: { id: string; name: string | null; email: string } | null;
  };
  availableDraftLeaders: DraftLeaderOption[];
  onClose: () => void;
  onSaved: () => void;
};

export default function DraftSessionEditModal({
  session,
  availableDraftLeaders,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(session.name);
  const [draftType, setDraftType] = useState(session.draftType || "SNAKE");
  const [status, setStatus] = useState(session.status || "SETUP");
  const [secondsPerPick, setSecondsPerPick] = useState(session.secondsPerPick || 120);
  const [totalRounds, setTotalRounds] = useState(session.totalRounds || 12);
  const [draftLeaderUserId, setDraftLeaderUserId] = useState(session.draftLeaderUserId || session.draftLeader?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/draft/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          draftType,
          status,
          secondsPerPick: secondsPerPick ? parseInt(String(secondsPerPick), 10) : null,
          totalRounds: parseInt(String(totalRounds), 10),
          draftLeaderUserId: draftLeaderUserId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update draft session");
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white">⚙️ Edit Draft Session</h3>
            <p className="text-xs text-zinc-400">Update session rules, timer, format, and assign Draft Leader</p>
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

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Draft Session Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              🎖️ Assigned Draft Leader (Admin Rights)
            </label>
            <select
              value={draftLeaderUserId}
              onChange={(e) => setDraftLeaderUserId(e.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500"
            >
              <option value="">-- No Draft Leader Assigned (System Admin Only) --</option>
              {availableDraftLeaders.map((dl) => (
                <option key={dl.id} value={dl.id}>
                  {dl.name || dl.email} {dl.isBoardMember ? "★ (Board Member)" : dl.isCoach ? "(Coach)" : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-400 mt-1">
              Draft Leaders have elevated rights to pick on behalf of teams, pause timers, and correct picks during the draft.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Draft Format</label>
              <select
                value={draftType}
                onChange={(e) => setDraftType(e.target.value)}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500"
              >
                <option value="SNAKE">Snake (1..N, N..1)</option>
                <option value="LINEAR">Linear (1..N, 1..N)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Session Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500"
              >
                <option value="SETUP">SETUP</option>
                <option value="PAIRED">PAIRED (Ready)</option>
                <option value="LIVE">LIVE (In Progress)</option>
                <option value="PAUSED">PAUSED</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="MATERIALIZED">MATERIALIZED</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Timer (Seconds / Pick)</label>
              <input
                type="number"
                min={0}
                max={600}
                step={15}
                value={secondsPerPick}
                onChange={(e) => setSecondsPerPick(parseInt(e.target.value) || 0)}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white"
              />
              <span className="text-[10px] text-zinc-500">Set 0 for untimed</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Total Rounds</label>
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
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 shadow"
          >
            {saving ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
