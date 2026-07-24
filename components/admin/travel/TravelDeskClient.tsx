"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type EventSummary = {
  id: string;
  name: string;
  teamLabel: string | null;
  status: string;
  googleSheetUrl: string | null;
  participantCount: number;
  summary: {
    total: number;
    not_started: number;
    draft: number;
    submitted: number;
  };
  template: { id: string; key: string; name: string };
  createdAt: string;
};

export default function TravelDeskClient({
  organizationId,
}: {
  organizationId: string;
}) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [teamLabel, setTeamLabel] = useState("");
  const [openOnCreate, setOpenOnCreate] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/trip/events?org=${encodeURIComponent(organizationId)}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as {
        events?: EventSummary[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to load events");
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/trip/events?org=${encodeURIComponent(organizationId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            name: name.trim(),
            teamLabel: teamLabel.trim() || null,
            status: openOnCreate ? "open" : "draft",
            googleSheetId: "1g4gKH_m_SVip4wI3uBzeZwIt6PVMmIu72qmj80xH7R0",
            googleSheetUrl:
              "https://docs.google.com/spreadsheets/d/1g4gKH_m_SVip4wI3uBzeZwIt6PVMmIu72qmj80xH7R0",
          }),
        },
      );
      const data = (await res.json()) as { error?: string; event?: { id: string } };
      if (!res.ok) throw new Error(data.error || "Create failed");
      setName("");
      setTeamLabel("");
      await load();
      if (data.event?.id) {
        window.location.href = `/admin/travel/${data.event.id}?org=${encodeURIComponent(organizationId)}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={createEvent}
        className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"
      >
        <h2 className="mb-1 text-lg font-semibold text-zinc-100">
          New trip event
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Creates a parent magic-link intake using the Southwest Regional Sheet
          columns (name, guardians, uniform, bats/throws).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-400">Event name</span>
            <input
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              placeholder="SW Regional 2026 — Ascension 10U"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-400">Team label (optional)</span>
            <input
              value={teamLabel}
              onChange={(ev) => setTeamLabel(ev.target.value)}
              placeholder="10U All-Stars"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={openOnCreate}
            onChange={(ev) => setOpenOnCreate(ev.target.checked)}
            className="rounded border-zinc-600"
          />
          Open for parents immediately
        </label>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="mt-4 rounded-lg border border-amber-600/60 bg-amber-950/40 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-950/60 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create event"}
        </button>
      </form>

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Events</h2>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No trip events yet for this organization.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 overflow-hidden">
            {events.map((ev) => (
              <li key={ev.id}>
                <Link
                  href={`/admin/travel/${ev.id}?org=${encodeURIComponent(organizationId)}`}
                  className="flex flex-col gap-1 px-4 py-3 hover:bg-zinc-900/80 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-100 truncate">{ev.name}</p>
                    <p className="text-xs text-zinc-500">
                      {ev.teamLabel ? `${ev.teamLabel} · ` : ""}
                      {ev.template.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <StatusPill status={ev.status} />
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-zinc-400 tabular-nums">
                      {ev.summary.submitted}/{ev.summary.total} submitted
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles =
    status === "open"
      ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-300"
      : status === "closed"
        ? "border-zinc-600 bg-zinc-800 text-zinc-400"
        : "border-amber-700/40 bg-amber-950/30 text-amber-200";
  return (
    <span className={`rounded-full border px-2 py-0.5 font-semibold capitalize ${styles}`}>
      {status}
    </span>
  );
}
