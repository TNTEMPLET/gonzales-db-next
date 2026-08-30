"use client";

import { useState } from "react";

type JerseyReportPreview = {
  report: {
    ageGroup: string;
    seasonYear: number;
    playerCount: number;
    missingNumberCount: number;
    missingSizeCount: number;
    teams: Array<{ teamName: string; players: unknown[] }>;
  };
  html: string;
  defaultFrom: string;
};

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * Per-division "email the jersey report" panel — separate from
 * AdminTeamsManager's per-team roster view since this operates across every
 * team in a division at once. Mirrors the Shirt/Cap Orders "email this
 * report" pattern: admin types recipients directly, no audience-rule setup.
 */
export default function JerseyReportPanel({
  orgQuery,
  seasonYear,
  ageGroupOptions,
}: {
  orgQuery: string;
  seasonYear: number;
  ageGroupOptions: string[];
}) {
  const [ageGroup, setAgeGroup] = useState("");
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<JerseyReportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPreview(nextAgeGroup: string) {
    setAgeGroup(nextAgeGroup);
    setPreview(null);
    setNotice("");
    setError("");
    if (!nextAgeGroup) return;
    setBusy(true);
    try {
      const params = new URLSearchParams(orgQuery);
      params.set("seasonYear", String(seasonYear));
      params.set("ageGroup", nextAgeGroup);
      const response = await fetch(`/api/admin/teams/jersey-report?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to load jersey report"));
      setPreview(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load jersey report");
    } finally {
      setBusy(false);
    }
  }

  async function sendReport() {
    if (!ageGroup || !recipients.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams/jersey-report?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonYear,
          ageGroup,
          to: recipients,
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to send jersey report"));
      const skipped = Array.isArray(json.skippedSuppressed) ? json.skippedSuppressed : [];
      setNotice(
        `Sent to ${json.to.length - skipped.length} recipient${json.to.length - skipped.length === 1 ? "" : "s"} — ${json.teamCount} teams, ${json.playerCount} players.` +
          (skipped.length > 0 ? ` Skipped (suppressed): ${skipped.join(", ")}.` : ""),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send jersey report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Uniforms</p>
        <h2 className="text-lg font-semibold">Jersey Report</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Email every team&apos;s numbers, names, and jersey sizes for one division.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-3">
        <select
          value={ageGroup}
          onChange={(event) => void loadPreview(event.target.value)}
          className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        >
          <option value="">Select a division…</option>
          {ageGroupOptions.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
        <input
          value={recipients}
          onChange={(event) => setRecipients(event.target.value)}
          placeholder="Recipient email(s), comma-separated"
          className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder={ageGroup ? `Jersey Report – ${ageGroup} – ${seasonYear}` : "Subject (optional)"}
          className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Note to include above the report (optional)"
          className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
      </div>

      {preview ? (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">
            {preview.report.teams.length} teams, {preview.report.playerCount} players
            {preview.report.missingNumberCount > 0
              ? ` — ${preview.report.missingNumberCount} missing a jersey number`
              : ""}
            {preview.report.missingSizeCount > 0
              ? ` — ${preview.report.missingSizeCount} missing a jersey size`
              : ""}
          </p>
          <div
            className="max-h-80 overflow-auto rounded-lg border border-zinc-800 bg-white p-3"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy || !ageGroup || !recipients.trim() || !preview || preview.report.playerCount === 0}
        onClick={() => void sendReport()}
        className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        Send Jersey Report
      </button>
    </div>
  );
}
