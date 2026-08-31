"use client";

import { useState } from "react";
import type { DraftSession } from "@/lib/draft/types";
import { getErrorMessage } from "@/lib/draft/clientError";
import { toCentralDateTimeLocalValue } from "@/lib/draft/centralTime";

type Props = {
  sessionId: string;
  session: Pick<DraftSession, "name" | "ageGroup" | "scheduledStartAt" | "invitesSentAt" | "teams">;
  coachLink: string;
  onClose: () => void;
  onSaved: () => void;
};

export default function DraftInviteModal({ sessionId, session, coachLink, onClose, onSaved }: Props) {
  const [scheduledStartAtLocal, setScheduledStartAtLocal] = useState(
    toCentralDateTimeLocalValue(session.scheduledStartAt),
  );
  const [autoDraftTeamIds, setAutoDraftTeamIds] = useState<Set<string>>(
    new Set(session.teams.filter((t) => t.autoDraftEnabled).map((t) => t.id)),
  );
  const [sendEmails, setSendEmails] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const toggleAutoDraft = (teamId: string) => {
    setAutoDraftTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledStartAtLocal,
          autoDraftTeamIds: Array.from(autoDraftTeamIds),
          sendEmails,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");

      if (sendEmails && data.emailResult) {
        const { sent, skippedSuppressed, failed, noCoachEmail } = data.emailResult;
        const parts = [`Sent ${sent} invitation${sent === 1 ? "" : "s"}.`];
        if (noCoachEmail.length > 0) parts.push(`No coach email on file for: ${noCoachEmail.join(", ")}.`);
        if (skippedSuppressed.length > 0) parts.push(`Skipped (unsubscribed): ${skippedSuppressed.length}.`);
        if (failed.length > 0) parts.push(`Failed: ${failed.join(", ")}.`);
        setResult(parts.join(" "));
      }

      onSaved();
      if (!sendEmails) onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📅</span> Schedule & Invite Coaches
            </h3>
            <p className="text-xs text-zinc-400">
              Set the start time, choose which teams auto-draft, and email coaches the live draft link.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">{error}</div>
        )}
        {result && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300">
            {result}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Scheduled Start (Central Time)</label>
            <input
              type="datetime-local"
              value={scheduledStartAtLocal}
              onChange={(e) => setScheduledStartAtLocal(e.target.value)}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500"
            />
            {session.invitesSentAt && (
              <p className="mt-1 text-[11px] text-zinc-500">
                Invitations last sent {new Date(session.invitesSentAt).toLocaleString()}.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300">Coach Link</span>
            </div>
            <code className="block break-all text-[11px] text-emerald-400">{coachLink}</code>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-2">Teams & Auto-Draft</label>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {session.teams.map((team) => {
                const emails = [team.headCoach?.email, team.assistantCoach?.email].filter(Boolean);
                return (
                  <div
                    key={team.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{team.teamName}</div>
                      <div className="text-[11px] text-zinc-500 truncate">
                        {emails.length > 0 ? emails.join(", ") : "No coach email on file"}
                      </div>
                    </div>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
                      <input
                        type="checkbox"
                        checked={autoDraftTeamIds.has(team.id)}
                        onChange={() => toggleAutoDraft(team.id)}
                      />
                      Auto-draft
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} />
            Email all coaches the draft link now
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 shadow"
          >
            {saving ? "Saving..." : sendEmails ? "Save & Send Invitations" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
