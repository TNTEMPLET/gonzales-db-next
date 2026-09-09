"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { formatNotifyClock } from "@/lib/scheduler/coachScheduleEmail";
import {
  buildDirectorScheduleEmail,
  filterDirectorGames,
  groupDirectorGames,
  parseDirectorEmails,
  type DirectorNotifyPayload,
} from "@/lib/scheduler/directorScheduleEmail";

async function safeJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function DirectorNotifySection({
  orgQuery,
  seasonId,
  payload,
  canSend,
  sendBlockedReason,
  onSent,
}: {
  orgQuery: string;
  seasonId: string;
  payload: DirectorNotifyPayload | null;
  canSend: boolean;
  sendBlockedReason: string | null;
  onSent?: () => void;
}) {
  const [selectedParkIds, setSelectedParkIds] = useState<string[]>([]);
  const [emailsText, setEmailsText] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const seededSeasonRef = useRef<string | null>(null);
  const seenParksRef = useRef(new Set<string>());

  const parks = payload?.parks ?? [];

  useEffect(() => {
    if (!seasonId) {
      seededSeasonRef.current = null;
      seenParksRef.current = new Set();
      setSelectedParkIds([]);
      return;
    }
    const ids = parks.map((park) => park.parkId);
    if (!ids.length) return;
    if (seededSeasonRef.current !== seasonId) {
      seededSeasonRef.current = seasonId;
      seenParksRef.current = new Set(ids);
      setSelectedParkIds(ids);
      return;
    }
    const newcomers = ids.filter((id) => !seenParksRef.current.has(id));
    for (const id of ids) seenParksRef.current.add(id);
    setSelectedParkIds((prev) => [...prev.filter((id) => ids.includes(id)), ...newcomers]);
  }, [payload?.parks, seasonId]);

  const selectedGames = useMemo(
    () => filterDirectorGames(payload?.games ?? [], selectedParkIds),
    [payload?.games, selectedParkIds],
  );
  const groups = useMemo(() => groupDirectorGames(selectedGames), [selectedGames]);
  const parsedEmails = useMemo(() => parseDirectorEmails(emailsText), [emailsText]);
  const email = useMemo(
    () =>
      buildDirectorScheduleEmail({
        orgName: payload?.orgName ?? "",
        seasonName: payload?.seasonName ?? "",
        games: selectedGames,
        gamesWindow: payload?.gamesWindow,
      }),
    [payload?.gamesWindow, payload?.orgName, payload?.seasonName, selectedGames],
  );
  const allParksSelected = parks.length > 0 && selectedParkIds.length === parks.length;

  function togglePark(parkId: string, checked: boolean) {
    setSelectedParkIds((prev) => (checked ? [...prev, parkId] : prev.filter((id) => id !== parkId)));
  }

  async function sendDirectors() {
    if (!seasonId || !parsedEmails.emails.length || !selectedGames.length) return;
    const parkLabels = parks
      .filter((park) => selectedParkIds.includes(park.parkId))
      .map((park) => park.parkName)
      .join(", ");
    const confirmed = window.confirm(
      `Email ${parsedEmails.emails.length} director${parsedEmails.emails.length === 1 ? "" : "s"} the ${selectedGames.length}-game board for ${parkLabels || "selected parks"}?`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams(orgQuery);
      const response = await fetch(`/api/admin/scheduler/notify?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId,
          audience: "directors",
          emails: emailsText,
          parkIds: selectedParkIds,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String((json as { error?: unknown }).error || "Failed to email directors"));
      const sent = Number((json as { sent?: unknown }).sent) || 0;
      const failed = Number((json as { failed?: unknown }).failed) || 0;
      const skipped = Number((json as { skipped?: unknown }).skipped) || 0;
      const parts = [`Emailed ${sent} director${sent === 1 ? "" : "s"}`];
      if (failed) parts.push(`${failed} failed`);
      if (skipped) parts.push(`${skipped} skipped`);
      setNotice(parts.join(" · "));
      if (sent) onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to email directors");
    } finally {
      setBusy(false);
    }
  }

  async function sendSample() {
    if (!seasonId || !selectedGames.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const meResponse = await fetch("/api/admin/me", { cache: "no-store" });
      const me = (await safeJson(meResponse)) as { user?: { email?: string } };
      const sampleEmail = me.user?.email?.trim() || "";
      if (!sampleEmail) throw new Error("Could not find your admin email for a sample");
      const confirmed = window.confirm(`Send a sample director board to ${sampleEmail}?`);
      if (!confirmed) {
        setBusy(false);
        return;
      }
      const params = new URLSearchParams(orgQuery);
      const response = await fetch(`/api/admin/scheduler/notify?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId,
          audience: "directors",
          sample: true,
          sampleEmail,
          parkIds: selectedParkIds,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String((json as { error?: unknown }).error || "Failed to email sample"));
      setNotice(`Sample sent to ${sampleEmail}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to email sample");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 border-t border-zinc-800 pt-6" data-season-id={seasonId} data-director-notify="true">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-white">Directors</h3>
          <p className="text-sm text-zinc-400">
            {payload
              ? `${selectedGames.length} games · ${groups.length} park${groups.length === 1 ? "" : "s"} · ${parsedEmails.emails.length} email${parsedEmails.emails.length === 1 ? "" : "s"}`
              : "Load a season to preview the director board."}
            {payload?.lastSentCount ? ` · last sent ${payload.lastSentCount}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void sendSample()}
            disabled={!seasonId || busy || !canSend || !selectedGames.length}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400 disabled:opacity-50"
          >
            Email me a sample
          </button>
          <button
            type="button"
            onClick={() => void sendDirectors()}
            disabled={!seasonId || busy || !canSend || !parsedEmails.emails.length || !selectedGames.length}
            className="rounded-xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {payload?.lastSentCount ? "Send again" : "Email directors"}
          </button>
        </div>
      </div>
      <p className="mb-3 text-sm text-zinc-400">
        Type director emails (comma or line breaks). Check parks to include. Each recipient gets a short note with the
        full board as a PDF, grouped by park, day, and field.
      </p>
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Director emails</span>
        <textarea
          value={emailsText}
          onChange={(event) => setEmailsText(event.target.value)}
          rows={3}
          placeholder="director@example.com, other@example.com"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
      </label>
      {parsedEmails.skipped ? (
        <p className="mb-3 text-sm text-amber-200">{parsedEmails.skipped} address{parsedEmails.skipped === 1 ? "" : "es"} skipped (not a valid email).</p>
      ) : null}
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedParkIds(parks.map((park) => park.parkId))}
          className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
        >
          All parks
        </button>
        <button
          type="button"
          onClick={() => setSelectedParkIds([])}
          className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
        >
          None
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2">
        {parks.map((park) => {
          const checked = selectedParkIds.includes(park.parkId);
          return (
            <label key={park.parkId || park.parkName} className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => togglePark(park.parkId, event.target.checked)}
              />
              <span className={checked ? "text-white" : ""}>
                {park.parkName} ({park.gameCount})
              </span>
            </label>
          );
        })}
      </div>
      <p className="mb-3 text-sm text-zinc-500">
        {selectedParkIds.length
          ? `${selectedGames.length} games in ${allParksSelected ? "all parks" : groups.map((park) => park.parkName).join(", ")}`
          : "No parks selected"}
      </p>
      {notice ? <p className="mb-3 text-sm text-emerald-200">{notice}</p> : null}
      {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}
      {!canSend && sendBlockedReason ? <p className="mb-3 text-sm text-amber-200">{sendBlockedReason}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBoardOpen((open) => !open)}
          disabled={!selectedGames.length}
          className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400 disabled:opacity-50"
        >
          {boardOpen ? "Hide board" : `Show board (${selectedGames.length})`}
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen((open) => !open)}
          disabled={!selectedGames.length}
          className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400 disabled:opacity-50"
        >
          {previewOpen ? "Hide email preview" : "Preview email"}
        </button>
      </div>
      {boardOpen ? (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-800">
          {groups.map((park) => (
            <div key={park.parkId || park.parkName} className="border-t border-zinc-800 first:border-t-0">
              <p className="bg-zinc-950 px-3 py-2 text-sm font-semibold text-white">{park.parkName}</p>
              {park.days.map((day) => (
                <div key={`${park.parkId}-${day.date}`}>
                  <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{day.dateLabel}</p>
                  <table className="min-w-[720px] w-full text-left text-sm text-zinc-300">
                    <thead className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      <tr>
                        <th className="px-3 py-1">Field</th>
                        <th className="px-3 py-1">Division</th>
                        <th className="px-3 py-1">Start</th>
                        <th className="px-3 py-1">Home</th>
                        <th className="px-3 py-1">Away</th>
                      </tr>
                    </thead>
                    <tbody>
                      {day.rows.map((game, index) => (
                        <tr key={`${game.date}-${game.fieldName}-${game.division}-${game.startTime}-${game.homeTeamName}-${index}`} className="border-t border-zinc-800">
                          <td className="px-3 py-1.5">{game.fieldName}</td>
                          <td className="px-3 py-1.5">{game.division}</td>
                          <td className="px-3 py-1.5">{formatNotifyClock(game.startTime)}</td>
                          <td className="px-3 py-1.5">{game.homeTeamName}</td>
                          <td className="px-3 py-1.5">{game.awayTeamName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}
          {!seasonId ? (
            <p className="p-4 text-sm text-zinc-500">Select a season first.</p>
          ) : !payload?.games.length && payload ? (
            <p className="p-4 text-sm text-zinc-500">No placed games to send yet.</p>
          ) : !selectedParkIds.length && parks.length ? (
            <p className="p-4 text-sm text-zinc-500">Select at least one park.</p>
          ) : null}
        </div>
      ) : null}
      {previewOpen ? (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
          <p className="text-xs font-semibold text-zinc-400">{email.subject}</p>
          <div
            className="mt-2 max-h-80 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900"
            dangerouslySetInnerHTML={{ __html: email.html }}
          />
        </div>
      ) : null}
    </div>
  );
}
