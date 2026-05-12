"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";
import { todayIsoDate } from "@/lib/admin/assignrDeskDateRange";

type OfficialOption = {
  id?: string | number;
  displayName?: string;
  first_name?: string;
  last_name?: string;
};

type AssignmentSlot = {
  id?: string | number;
  sort_order?: number;
  status?: string;
  position?: string;
  position_abbreviation?: string;
  accepted?: boolean;
  declined?: boolean;
  assigned?: boolean;
  _embedded?: {
    official?: OfficialOption;
    position?: { id?: string | number; name?: string };
  };
};

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
    assignments?: AssignmentSlot[];
  };
};

type AssignmentStatus = "accepted" | "declined" | "pending";

function defaultDateRange() {
  return { startDate: todayIsoDate(), endDate: "" };
}

function officialLabel(official?: OfficialOption) {
  if (!official) return "";
  const displayName = official.displayName?.trim();
  if (displayName) return displayName;
  return `${official.first_name || ""} ${official.last_name || ""}`.trim();
}

function positionPrefix(assignment: AssignmentSlot) {
  const abbreviation = assignment.position_abbreviation?.trim().toUpperCase();
  if (abbreviation) return `${abbreviation}:`;

  const positionName =
    assignment.position?.trim() ||
    assignment._embedded?.position?.name?.trim() ||
    "";
  if (/plate/i.test(positionName)) return "P:";
  if (/field/i.test(positionName)) return "F:";
  return positionName ? `${positionName.slice(0, 1).toUpperCase()}:` : "U:";
}

function assignmentStatus(assignment: AssignmentSlot): AssignmentStatus {
  if (assignment.declined || assignment.status === "D") return "declined";
  if (assignment.accepted || assignment.status === "A") return "accepted";
  return "pending";
}

function embeddedOfficialId(assignment: AssignmentSlot) {
  const id = assignment._embedded?.official?.id;
  return id !== undefined && id !== null ? String(id) : "";
}

function assignmentNeedsApply(assignment: AssignmentSlot, selectedOfficialId: string) {
  if (!selectedOfficialId.trim()) return false;
  return selectedOfficialId !== embeddedOfficialId(assignment);
}

function sortAssignments(assignments: AssignmentSlot[]) {
  return [...assignments].sort((left, right) => {
    const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor">
      <path d="M5 10.5 8 13.5 15 6.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor">
      <path d="m6 6 8 8M14 6l-8 8" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function StatusActionButton({
  label,
  tone,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone: "accept" | "decline";
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const toneClasses =
    tone === "accept"
      ? active
        ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
        : "border-emerald-500/30 bg-emerald-500/5 text-emerald-200 hover:border-emerald-400/60 hover:bg-emerald-500/15"
      : active
        ? "border-red-400/70 bg-red-500/20 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.15)]"
        : "border-red-500/30 bg-red-500/5 text-red-200 hover:border-red-400/60 hover:bg-red-500/15";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClasses}`}
    >
      {children}
    </button>
  );
}

function AssignmentSlotActions({
  assignment,
  selectedOfficialId,
  busy,
  pending,
  onAssign,
}: {
  assignment: AssignmentSlot;
  selectedOfficialId: string;
  busy: boolean;
  pending: boolean;
  onAssign: () => void;
}) {
  const status = assignmentStatus(assignment);
  const hasEmbeddedOfficial = Boolean(embeddedOfficialId(assignment));
  const needsApply = assignmentNeedsApply(assignment, selectedOfficialId);
  const disabled = busy || pending;

  if (!hasEmbeddedOfficial) {
    return (
      <StatusActionButton
        label="Apply selected umpire"
        tone="accept"
        disabled={disabled || !needsApply}
        onClick={onAssign}
      >
        <CheckIcon />
      </StatusActionButton>
    );
  }

  if (status === "accepted") {
    return (
      <StatusActionButton label="Accepted" tone="accept" active disabled={disabled}>
        <CheckIcon />
      </StatusActionButton>
    );
  }

  if (status === "declined") {
    return (
      <StatusActionButton label="Declined" tone="decline" active disabled={disabled}>
        <XIcon />
      </StatusActionButton>
    );
  }

  if (needsApply) {
    return (
      <StatusActionButton
        label="Apply selected umpire"
        tone="accept"
        disabled={disabled}
        onClick={onAssign}
      >
        <CheckIcon />
      </StatusActionButton>
    );
  }

  return <span className="px-1 text-xs text-zinc-500">Awaiting official response</span>;
}

export default function AdminAssignrAssignmentsManager({
  targetOrg,
}: {
  targetOrg: ContentOrgId;
}) {
  const defaults = useMemo(() => defaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [view, setView] = useState<"all" | "unassigned">("all");
  const [games, setGames] = useState<AssignmentGame[]>([]);
  const [officials, setOfficials] = useState<OfficialOption[]>([]);
  const [officialSelections, setOfficialSelections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingAssignmentId, setPendingAssignmentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const officialOptions = useMemo(
    () =>
      [...officials].sort((left, right) =>
        officialLabel(left).localeCompare(officialLabel(right)),
      ),
    [officials],
  );

  async function loadOfficials() {
    try {
      const response = await fetch(`/api/admin/assignr/officials?org=${targetOrg}`);
      const json = (await response.json()) as {
        error?: string;
        data?: OfficialOption[];
      };
      if (!response.ok) {
        throw new Error(json.error || "Failed to load officials");
      }
      setOfficials(json.data ?? []);
    } catch {
      setOfficials([]);
    }
  }

  async function loadGames() {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        org: targetOrg,
        scope: "site",
        view,
      });
      if (startDate.trim()) {
        params.set("startDate", startDate);
      }
      if (endDate.trim()) {
        params.set("endDate", endDate);
      }
      const response = await fetch(`/api/admin/assignr/assignments?${params}`);
      const json = (await response.json()) as {
        error?: string;
        data?: AssignmentGame[];
      };
      if (!response.ok) {
        throw new Error(json.error || "Failed to load assignments");
      }
      const nextGames = json.data ?? [];
      setGames(nextGames);

      const nextSelections: Record<string, string> = {};
      for (const game of nextGames) {
        for (const assignment of game._embedded?.assignments ?? []) {
          if (!assignment.id) continue;
          const officialId = assignment._embedded?.official?.id;
          nextSelections[String(assignment.id)] =
            officialId !== undefined && officialId !== null ? String(officialId) : "";
        }
      }
      setOfficialSelections(nextSelections);
    } catch (err: unknown) {
      setGames([]);
      setOfficialSelections({});
      setError(err instanceof Error ? err.message : "Failed to load assignments");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadOfficials();
  }, [targetOrg]);

  useEffect(() => {
    void loadGames();
  }, [targetOrg, startDate, endDate, view]);

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

  async function assignOfficial(assignmentId: string | number, officialId: string) {
    setPendingAssignmentId(String(assignmentId));
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/assignr/assignments/${assignmentId}/assign?org=${targetOrg}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ officialId }),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to assign umpire");
      }
      setNotice(`Assignment ${assignmentId} updated in Assignr.`);
      await loadGames();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to assign umpire");
    } finally {
      setPendingAssignmentId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
        <label className="text-sm text-zinc-300">
          Start
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
        <label className="text-sm text-zinc-300">
          End
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          />
        </label>
        <label className="text-sm text-zinc-300">
          View
          <select
            value={view}
            onChange={(event) => setView(event.target.value as "all" | "unassigned")}
            className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          >
            <option value="all">All games</option>
            <option value="unassigned">Open slots only</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadGames()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950/90 text-left text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Matchup</th>
              <th className="px-4 py-3">Venue</th>
              <th className="px-4 py-3">Assignments</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {games.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-zinc-500" colSpan={5}>
                  {busy
                    ? "Loading…"
                    : view === "unassigned"
                      ? "No games with open assignment slots in this range."
                      : "No games in this range."}
                </td>
              </tr>
            ) : (
              games.map((game) => (
                <tr
                  key={String(game.id)}
                  className="border-t border-zinc-800/80 align-top transition hover:bg-zinc-950/40"
                >
                  <td className="px-4 py-4">
                    <div className="font-medium text-white">{game.localized_date || "—"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{game.localized_time || "TBD"}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium text-zinc-100">
                      {game.home_team} vs {game.away_team}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{game.age_group}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-zinc-200">{game._embedded?.venue?.name || "—"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{game.subvenue || ""}</div>
                  </td>
                  <td className="px-4 py-4">
                    {(game._embedded?.assignments ?? []).length === 0 ? (
                      <span className="text-zinc-500">No assignment slots</span>
                    ) : (
                      <div className="space-y-2">
                        {sortAssignments(game._embedded?.assignments ?? []).map((assignment) => {
                          const assignmentId = assignment.id ? String(assignment.id) : "";
                          const selectedOfficialId =
                            officialSelections[assignmentId] ??
                            (assignment._embedded?.official?.id !== undefined &&
                            assignment._embedded?.official?.id !== null
                              ? String(assignment._embedded.official.id)
                              : "");

                          return (
                            <div
                              key={assignmentId || `${game.id}-${assignment.sort_order}`}
                              className="flex items-center gap-2 rounded-xl border border-zinc-800/90 bg-zinc-950/70 px-2.5 py-2"
                            >
                              <span className="w-7 shrink-0 font-mono text-xs font-semibold text-brand-gold">
                                {positionPrefix(assignment)}
                              </span>
                              <select
                                value={selectedOfficialId}
                                disabled={busy || !assignmentId}
                                onChange={(event) => {
                                  if (!assignmentId) return;
                                  setOfficialSelections((current) => ({
                                    ...current,
                                    [assignmentId]: event.target.value,
                                  }));
                                }}
                                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none transition focus:border-brand-gold/60 focus:ring-2 focus:ring-brand-gold/20 disabled:opacity-50"
                              >
                                <option value="">Unassigned</option>
                                {officialOptions.map((official) => {
                                  const id = official.id;
                                  if (id === undefined || id === null) return null;
                                  return (
                                    <option key={String(id)} value={String(id)}>
                                      {officialLabel(official) || `Official ${id}`}
                                    </option>
                                  );
                                })}
                              </select>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <AssignmentSlotActions
                                  assignment={assignment}
                                  selectedOfficialId={selectedOfficialId}
                                  busy={busy}
                                  pending={pendingAssignmentId === assignmentId}
                                  onAssign={() => {
                                    if (!assignment.id || !selectedOfficialId) return;
                                    void assignOfficial(assignment.id, selectedOfficialId);
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {game.id ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void unassignGame(game.id!)}
                        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
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
