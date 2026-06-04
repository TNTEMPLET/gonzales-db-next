"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clampSeedNumber, reorderTeamToSeed } from "@/lib/tournament-brackets/bracketTeamSeeds";
import { resolveRosterAgeGroup } from "@/lib/tournament-brackets/resolveRosterAgeGroup";

type RosterTeam = { id: string; teamName: string };

type RosterOptions = {
  ageGroups: string[];
  teamsByAgeGroup: Record<string, RosterTeam[]>;
};

type Props = {
  organizationId: string;
  seasonYear: number;
  busy?: boolean;
  selectedTeamNames: string[];
  onSelectedTeamNamesChange: (names: string[]) => void;
  rosterAgeGroup?: string | null;
  championAgeGroupLabel?: string | null;
  divisionLabel?: string | null;
  onAgeGroupChange?: (ageGroup: string) => void;
};

export default function BracketTeamPicker({
  organizationId,
  seasonYear,
  busy = false,
  selectedTeamNames,
  onSelectedTeamNamesChange,
  rosterAgeGroup,
  championAgeGroupLabel,
  divisionLabel,
  onAgeGroupChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<RosterOptions | null>(null);
  const [ageGroup, setAgeGroup] = useState("");
  const [seedDraftByTeam, setSeedDraftByTeam] = useState<Record<string, string>>({});
  const [manualInput, setManualInput] = useState("");
  const lastAutoFilledAgeGroupRef = useRef<string | null>(null);

  function addManualTeam() {
    const name = manualInput.trim();
    if (!name) return;
    if (selectedTeamNames.map((n) => n.trim().toLowerCase()).includes(name.toLowerCase())) return;
    onSelectedTeamNamesChange([...selectedTeamNames, name]);
    setManualInput("");
  }

  function removeTeam(name: string) {
    onSelectedTeamNamesChange(selectedTeamNames.filter((n) => n !== name));
  }

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/admin/tournament-brackets/roster-options", window.location.origin);
      url.searchParams.set("organizationId", organizationId);
      url.searchParams.set("seasonYear", String(seasonYear));
      const res = await fetch(url.toString());
      const json = (await res.json()) as RosterOptions & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed to load teams (${res.status})`);
      setOptions({
        ageGroups: json.ageGroups ?? [],
        teamsByAgeGroup: json.teamsByAgeGroup ?? {},
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setOptions(null);
    } finally {
      setLoading(false);
    }
  }, [organizationId, seasonYear]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (!options) return;
    const resolved = resolveRosterAgeGroup(options.ageGroups, {
      rosterAgeGroup,
      championAgeGroupLabel,
      divisionLabel,
    });
    if (resolved) setAgeGroup(resolved);
  }, [options, rosterAgeGroup, championAgeGroupLabel, divisionLabel]);

  const rosterTeams = useMemo(() => {
    if (!options || !ageGroup.trim()) return [];
    return options.teamsByAgeGroup[ageGroup.trim()] ?? [];
  }, [options, ageGroup]);

  const rosterNameSet = useMemo(
    () => new Set(rosterTeams.map((t) => t.teamName.trim()).filter(Boolean)),
    [rosterTeams],
  );

  const selectedSet = useMemo(() => new Set(selectedTeamNames.map((n) => n.trim())), [selectedTeamNames]);

  function setAgeGroupAndNotify(next: string) {
    setAgeGroup(next);
    onAgeGroupChange?.(next);
  }

  function rosterTeamNamesSorted(): string[] {
    return rosterTeams
      .map((t) => t.teamName.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "en-US", { numeric: true, sensitivity: "base" }));
  }

  useEffect(() => {
    const ag = ageGroup.trim();
    if (!ag || rosterTeams.length === 0) return;
    if (lastAutoFilledAgeGroupRef.current === ag) return;

    const preserveExisting =
      lastAutoFilledAgeGroupRef.current === null &&
      selectedTeamNames.length > 0 &&
      selectedTeamNames.every((n) => rosterNameSet.has(n.trim()));

    lastAutoFilledAgeGroupRef.current = ag;
    if (preserveExisting) return;

    onSelectedTeamNamesChange(rosterTeamNamesSorted());
  }, [ageGroup, rosterTeams, rosterNameSet, selectedTeamNames, onSelectedTeamNamesChange]);

  function toggleTeam(teamName: string, checked: boolean) {
    const name = teamName.trim();
    if (!name) return;
    if (checked) {
      if (!selectedSet.has(name)) {
        onSelectedTeamNamesChange([...selectedTeamNames, name]);
      }
    } else {
      onSelectedTeamNamesChange(selectedTeamNames.filter((n) => n.trim() !== name));
    }
  }

  function setSeedForTeam(teamName: string, rawSeed: number) {
    const next = reorderTeamToSeed(selectedTeamNames, teamName, rawSeed);
    onSelectedTeamNamesChange(next);
    setSeedDraftByTeam((prev) => {
      const copy = { ...prev };
      delete copy[teamName.trim()];
      return copy;
    });
  }

  function commitSeedDraft(teamName: string, draft: string, teamCount: number) {
    const parsed = Number.parseInt(draft.trim(), 10);
    if (!Number.isFinite(parsed)) {
      setSeedDraftByTeam((prev) => {
        const copy = { ...prev };
        delete copy[teamName.trim()];
        return copy;
      });
      return;
    }
    setSeedForTeam(teamName, clampSeedNumber(parsed, teamCount));
  }

  function handleAgeGroupChange(next: string) {
    lastAutoFilledAgeGroupRef.current = null;
    setAgeGroupAndNotify(next);
  }

  return (
    <label className="mt-3 block text-xs font-medium text-zinc-400">
      Teams
      <div className="mt-1 space-y-3 rounded-lg border border-zinc-700/80 bg-zinc-950/40 p-3 font-normal">
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Teams load from the league roster for the age group this bracket uses ({seasonYear} season). Set each
          team&apos;s seed # (1 = top seed); uncheck any team that should not be in the bracket.
        </p>

        {loading ? <p className="text-xs text-zinc-500">Loading roster…</p> : null}
        {error ? (
          <p className="text-xs text-amber-300">
            {error}{" "}
            <button type="button" className="underline" onClick={() => void loadOptions()}>
              Retry
            </button>
          </p>
        ) : null}

        {!loading && options && options.ageGroups.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No league roster found for this org — add teams manually below.
          </p>
        ) : null}

        {!loading && options && options.ageGroups.length > 0 ? (
          <>
            <label className="block text-[11px] font-medium text-zinc-500">
              Age group
              <select
                className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100"
                value={ageGroup}
                disabled={busy}
                onChange={(e) => handleAgeGroupChange(e.target.value)}
              >
                <option value="">Select age group…</option>
                {options.ageGroups.map((ag) => (
                  <option key={ag} value={ag}>
                    {ag} ({options.teamsByAgeGroup[ag]?.length ?? 0} teams)
                  </option>
                ))}
              </select>
            </label>

            {ageGroup.trim() && rosterTeams.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Include in bracket</p>
                  <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/60 p-2">
                    {rosterTeams.map((team) => {
                      const name = team.teamName.trim();
                      const checked = selectedSet.has(name);
                      return (
                        <li key={team.id}>
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={busy}
                              onChange={(e) => toggleTeam(team.teamName, e.target.checked)}
                            />
                            <span className="min-w-0 truncate">{team.teamName}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>

              </div>
            ) : ageGroup.trim() ? (
              <p className="text-xs text-zinc-500">No teams in {ageGroup} for {seasonYear}.</p>
            ) : (
              <p className="text-xs text-zinc-500">Choose an age group to load teams from the roster.</p>
            )}
          </>
        ) : null}
        {selectedTeamNames.length > 0 ? (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Teams — {selectedTeamNames.length} added (drag seed # to reorder)
            </p>
            <ul className="mt-1 space-y-1 rounded border border-zinc-800 bg-zinc-950/60 p-2">
              {selectedTeamNames.map((name, index) => {
                const seed = index + 1;
                const teamCount = selectedTeamNames.length;
                const draft = seedDraftByTeam[name] ?? String(seed);
                return (
                  <li
                    key={`${name}-${index}`}
                    className="flex items-center gap-2 rounded border border-zinc-800/60 bg-zinc-950/80 px-2 py-1.5 text-sm text-zinc-200"
                  >
                    <label className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-500">
                      <span className="sr-only">Seed for {name}</span>
                      <span aria-hidden>#</span>
                      <input
                        type="number"
                        min={1}
                        max={teamCount}
                        step={1}
                        value={draft}
                        disabled={busy}
                        className="w-12 rounded border border-zinc-600 bg-zinc-950 px-1.5 py-0.5 text-center text-xs tabular-nums text-zinc-100"
                        onChange={(e) =>
                          setSeedDraftByTeam((prev) => ({ ...prev, [name]: e.target.value }))
                        }
                        onBlur={(e) => commitSeedDraft(name, e.target.value, teamCount)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitSeedDraft(name, (e.target as HTMLInputElement).value, teamCount);
                          }
                        }}
                      />
                    </label>
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove ${name}`}
                      className="shrink-0 rounded px-1 text-zinc-500 hover:text-red-400 disabled:opacity-40"
                      onClick={() => removeTeam(name)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {!loading ? (
          <div className="mt-3 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {options && options.ageGroups.length > 0 ? "Or add team manually" : "Add teams manually"}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Team name…"
                value={manualInput}
                disabled={busy}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addManualTeam(); }
                }}
              />
              <button
                type="button"
                disabled={busy || !manualInput.trim()}
                className="shrink-0 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
                onClick={addManualTeam}
              >
                Add
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </label>
  );
}
