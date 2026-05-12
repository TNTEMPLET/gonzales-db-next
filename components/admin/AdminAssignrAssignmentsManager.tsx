"use client";

import { useEffect, useMemo, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";

type AssignmentGame = {
  id?: string | number;
  localized_date?: string;
  localized_time?: string;
  home_team?: string;
  away_team?: string;
  age_group?: string;
  subvenue?: string;
  status?: string;
  _embedded?: {
    venue?: { name?: string };
    assignments?: Array<{
      id?: string | number;
      status?: string;
      _embedded?: {
        official?: { id?: string | number; first_name?: string; last_name?: string };
        position?: { name?: string };
      };
    }>;
  };
};

function defaultDateRange() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 14);
  const format = (value: Date) => value.toISOString().slice(0, 10);
  return { startDate: format(start), endDate: format(end) };
}

export default function AdminAssignrAssignmentsManager({
  targetOrg,
}: {
  targetOrg: ContentOrgId;
}) {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [games, setGames] = useState<AssignmentGame[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadGames() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        org: targetOrg,
        startDate,
        endDate,
        scope: "site",
      });
      const response = await fetch(`/api/admin/assignr/assignments?${params}`);
      const json = (await response.json()) as {
        error?: string;
        data?: AssignmentGame[];
      };
      if (!response.ok) {
        throw new Error(json.error || "Failed to load unassigned games");
      }
      setGames(json.data ?? []);
    } catch (err: unknown) {
      setGames([]);
      setError(err instanceof Error ? err.message : "Failed to load unassigned games");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadGames();
  }, [targetOrg, startDate, endDate]);

  async function unassignGame(gameId: string | number) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/assignr/games/${gameId}/unassign?org=${targetOrg}`,
        { method: "PUT" },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to unassign game");
      }
      setNotice(`Cleared officials for game ${gameId}.`);
      await loadGames();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to unassign game");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAssignment(
    assignmentId: string | number,
    status: "A" | "D",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/assignr/assignments/${assignmentId}/confirm?org=${targetOrg}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to update assignment");
      }
      setNotice(`Assignment ${assignmentId} marked ${status === "A" ? "accepted" : "declined"}.`);
      await loadGames();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update assignment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-300">
          Start
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </label>
        <label className="text-sm text-zinc-300">
          End
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadGames()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Matchup</th>
              <th className="px-4 py-2">Venue</th>
              <th className="px-4 py-2">Assignments</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {games.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={5}>
                  {busy ? "Loading…" : "No unassigned games in this range."}
                </td>
              </tr>
            ) : (
              games.map((game) => (
                <tr key={String(game.id)} className="border-t border-zinc-800 align-top">
                  <td className="px-4 py-3">
                    <div>{game.localized_date || "—"}</div>
                    <div className="text-xs text-zinc-500">{game.localized_time || "TBD"}</div>
                  </td>
                  <td className="px-4 py-3">
                    {game.home_team} vs {game.away_team}
                    <div className="text-xs text-zinc-500">{game.age_group}</div>
                  </td>
                  <td className="px-4 py-3">
                    {game._embedded?.venue?.name || "—"}
                    <div className="text-xs text-zinc-500">{game.subvenue || ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    {(game._embedded?.assignments ?? []).length === 0 ? (
                      <span className="text-zinc-500">No assignment slots</span>
                    ) : (
                      <ul className="space-y-2">
                        {(game._embedded?.assignments ?? []).map((assignment) => {
                          const official = assignment._embedded?.official;
                          const name = official
                            ? `${official.first_name || ""} ${official.last_name || ""}`.trim()
                            : "Unfilled";
                          return (
                            <li key={String(assignment.id)} className="text-xs text-zinc-300">
                              {assignment._embedded?.position?.name || "Position"}: {name}
                              {assignment.id ? (
                                <span className="ml-2 inline-flex gap-1">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void confirmAssignment(assignment.id!, "A")}
                                    className="rounded border border-emerald-500/40 px-2 py-0.5 text-emerald-200"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void confirmAssignment(assignment.id!, "D")}
                                    className="rounded border border-amber-500/40 px-2 py-0.5 text-amber-200"
                                  >
                                    Decline
                                  </button>
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {game.id ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void unassignGame(game.id!)}
                        className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                      >
                        Unassign all
                      </button>
                    ) : null}
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
