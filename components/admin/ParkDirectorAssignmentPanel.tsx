"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getAdminRoleLabel, type AdminRole } from "@/lib/auth/adminRoles";
import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";

type VenueChoice = {
  id: string;
  name: string;
  shortName: string | null;
  isActive: boolean;
};

type DirectorRow = {
  id: string;
  email: string;
  name: string | null;
  orgRoles: Partial<Record<ContentOrgId, AdminRole>>;
  venues: { id: string; name: string; active: boolean }[];
};

type Screen = {
  directors: DirectorRow[];
  venues: VenueChoice[];
};

export default function ParkDirectorAssignmentPanel() {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [directorId, setDirectorId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/park-director-assignments", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not load park assignments.");
      setScreen(json.screen as Screen);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load park assignments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const director = useMemo(
    () => screen?.directors.find((row) => row.id === directorId) ?? null,
    [screen, directorId],
  );
  const activeVenueIds = useMemo(
    () => new Set((director?.venues ?? []).filter((venue) => venue.active).map((venue) => venue.id)),
    [director],
  );
  const availableVenues = useMemo(
    () => (screen?.venues ?? []).filter((venue) => !activeVenueIds.has(venue.id)),
    [screen, activeVenueIds],
  );

  async function mutate(method: "POST" | "DELETE", nextVenueId: string) {
    if (!directorId || !nextVenueId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin/park-director-assignments", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminUserId: directorId, venueId: nextVenueId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not update that park.");
      setScreen(json.screen as Screen);
      setVenueId("");
      setNotice(method === "POST" ? "Park assigned." : "Park unassigned.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update that park.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Park director parks</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          A park director belongs to a physical park, not a league. Assign the shared parks they
          cover. Games at those parks, from every league, are the ones they can change. Until a
          director has a park, or a league park is not linked to a shared park yet, their current
          game-day access stays as it is.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading parks…</p>
      ) : !screen || screen.directors.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No park directors yet. Give someone the Park Director role above, then choose their parks here.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-400">Park director</span>
            <select
              value={directorId}
              onChange={(event) => {
                setDirectorId(event.target.value);
                setVenueId("");
                setNotice("");
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">— Select a park director —</option>
              {screen.directors.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.email}
                  {row.name ? ` (${row.name})` : ""}
                </option>
              ))}
            </select>
            {director ? (
              <p className="mt-2 text-xs text-zinc-500">
                {Object.entries(director.orgRoles)
                  .map(([org, role]) => `${getOrgDisplayName(org as ContentOrgId)}: ${getAdminRoleLabel(role)}`)
                  .join(" · ") || "Park Director"}
              </p>
            ) : null}
          </label>

          <form
            className="block text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate("POST", venueId);
            }}
          >
            <span className="mb-1 block text-zinc-400">Shared park</span>
            <div className="flex gap-2">
              <select
                value={venueId}
                onChange={(event) => setVenueId(event.target.value)}
                disabled={!director}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
              >
                <option value="">— Select a park —</option>
                {availableVenues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                    {venue.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy || !directorId || !venueId}
                className="rounded-lg border border-emerald-600/60 bg-emerald-950/40 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-950/60 disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </form>
        </div>
      )}

      {director ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-200">Assigned parks</h3>
          {director.venues.filter((venue) => venue.active).length === 0 ? (
            <p className="text-sm text-zinc-500">
              No parks yet. This director still has their current game-day access until you assign one.
            </p>
          ) : (
            <ul className="space-y-2">
              {director.venues
                .filter((venue) => venue.active)
                .map((venue) => (
                  <li
                    key={venue.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm"
                  >
                    <span className="text-zinc-100">{venue.name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void mutate("DELETE", venue.id)}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                    >
                      Unassign
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : null}

      {screen && screen.venues.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No shared parks yet. Add them on the Parks screen, then assign directors here.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">{notice}</div>
      ) : null}
    </div>
  );
}
