"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type FieldDef = {
  key: string;
  label: string;
  sheetColumn: string;
  sortOrder: number;
};

type Participant = {
  id: string;
  playerFullName: string;
  ageGroup: string | null;
  team: string | null;
  jerseyNumber: string | null;
  status: string;
  inviteToken: string;
  inviteUrl: string;
  submitterName: string | null;
  submitterEmail: string | null;
  submittedAt: string | null;
  answers: Record<string, unknown>;
};

type EventDetail = {
  id: string;
  name: string;
  teamLabel: string | null;
  status: string;
  googleSheetUrl: string | null;
  introMarkdown: string | null;
  organizationId: string;
  fields: FieldDef[];
};

export default function TravelEventDetailClient({
  eventId,
  organizationId,
}: {
  eventId: string;
  organizationId: string;
}) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [namesText, setNamesText] = useState("");
  const [adding, setAdding] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const orgQ = `org=${encodeURIComponent(organizationId)}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/trip/events/${eventId}?${orgQ}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as {
        event?: EventDetail;
        participants?: Participant[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setEvent(data.event ?? null);
      setParticipants(data.participants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [eventId, orgQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const s = { total: 0, not_started: 0, draft: 0, submitted: 0 };
    for (const p of participants) {
      s.total++;
      if (p.status === "submitted") s.submitted++;
      else if (p.status === "draft") s.draft++;
      else s.not_started++;
    }
    return s;
  }, [participants]);

  async function addPlayers(e: React.FormEvent) {
    e.preventDefault();
    if (!namesText.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/trip/events/${eventId}/participants?${orgQ}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ namesText }),
        },
      );
      const data = (await res.json()) as { error?: string; created?: number };
      if (!res.ok) throw new Error(data.error || "Add failed");
      setNamesText("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function setStatus(status: string) {
    setStatusBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/trip/events/${eventId}?${orgQ}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setStatusBusy(false);
    }
  }

  async function copyLink(p: Participant) {
    try {
      await navigator.clipboard.writeText(p.inviteUrl);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setError("Could not copy link");
    }
  }

  function exportUrl(opts: { sheetOnly?: boolean; inviteUrls?: boolean }) {
    const params = new URLSearchParams();
    params.set("org", organizationId);
    if (opts.sheetOnly === false) params.set("sheetOnly", "0");
    if (opts.inviteUrls) params.set("inviteUrls", "1");
    return `/api/admin/trip/events/${eventId}/export?${params.toString()}`;
  }

  if (loading && !event) {
    return <p className="text-sm text-zinc-500">Loading event…</p>;
  }

  if (!event) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-300">{error || "Event not found"}</p>
        <Link href={`/admin/travel?${orgQ}`} className="text-sm text-amber-300 hover:underline">
          ← Back to Travel desk
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/travel?${orgQ}`}
            className="mb-2 inline-block text-xs text-zinc-500 hover:text-zinc-300"
          >
            ← All trip events
          </Link>
          <h2 className="text-2xl font-bold text-zinc-50">{event.name}</h2>
          {event.teamLabel && (
            <p className="text-sm text-zinc-400">{event.teamLabel}</p>
          )}
          {event.googleSheetUrl && (
            <a
              href={event.googleSheetUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-sky-400 hover:underline"
            >
              Open Google Sheet ↗
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
              event.status === "open"
                ? "border-emerald-700/50 text-emerald-300"
                : event.status === "closed"
                  ? "border-zinc-600 text-zinc-400"
                  : "border-amber-700/40 text-amber-200"
            }`}
          >
            {event.status}
          </span>
          {event.status !== "open" && (
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => void setStatus("open")}
              className="rounded-lg border border-emerald-700/50 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-50"
            >
              Open for parents
            </button>
          )}
          {event.status === "open" && (
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => void setStatus("closed")}
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Players" value={summary.total} />
        <Stat label="Submitted" value={summary.submitted} accent="emerald" />
        <Stat label="Draft" value={summary.draft} accent="amber" />
        <Stat label="Not started" value={summary.not_started} />
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={exportUrl({ sheetOnly: true })}
          className="rounded-lg border border-sky-700/50 bg-sky-950/30 px-3 py-2 text-sm font-medium text-sky-200 hover:bg-sky-950/50"
        >
          Export Sheet CSV
        </a>
        <a
          href={exportUrl({ sheetOnly: false, inviteUrls: true })}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
        >
          Export + invite links
        </a>
      </div>

      <form
        onSubmit={addPlayers}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
      >
        <h3 className="mb-1 font-semibold text-zinc-100">Add players</h3>
        <p className="mb-3 text-xs text-zinc-500">
          One full name per line. Each player gets a unique magic link for parents.
        </p>
        <textarea
          value={namesText}
          onChange={(ev) => setNamesText(ev.target.value)}
          rows={5}
          placeholder={"Alex Rivera\nJordan Lee\nSam Patel"}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
        />
        <button
          type="submit"
          disabled={adding || !namesText.trim()}
          className="mt-3 rounded-lg border border-amber-600/60 bg-amber-950/40 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add & generate links"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Guardian</th>
              <th className="px-3 py-2 font-medium">Invite</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {participants.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  No players yet — paste names above.
                </td>
              </tr>
            ) : (
              participants.map((p) => (
                <tr key={p.id} className="hover:bg-zinc-900/50">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-zinc-100">{p.playerFullName}</p>
                    {p.jerseyNumber && (
                      <p className="text-xs text-zinc-500">#{p.jerseyNumber}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusDot status={p.status} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-zinc-400">
                    {p.submitterName || p.submitterEmail ? (
                      <>
                        <p>{p.submitterName}</p>
                        <p className="text-zinc-500">{p.submitterEmail}</p>
                      </>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => void copyLink(p)}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-amber-600/50 hover:text-amber-200"
                    >
                      {copiedId === p.id ? "Copied!" : "Copy link"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "amber";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
        ? "text-amber-300"
        : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "submitted"
      ? "bg-emerald-500"
      : status === "draft"
        ? "bg-amber-400"
        : "bg-zinc-600";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300 capitalize">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {status.replace("_", " ")}
    </span>
  );
}
