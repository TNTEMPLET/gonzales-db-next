"use client";

import { useEffect, useState } from "react";

import BracketTeamPicker from "@/components/admin/BracketTeamPicker";
import type { BracketMatch, BracketRound, BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  canAutoGenerateSingleEliminationRounds,
  generateSingleEliminationRoundsFromTeams,
  getSupportedSingleElimAutoSizes,
} from "@/lib/tournament-brackets/generateSingleElimFromTeams";

type Props = {
  spec: BracketSpec;
  projectId: string;
  projectUpdatedAt: string;
  organizationId: string;
  seasonYear: number;
  busy: boolean;
  /** When true (e.g. published READY), structural edits are disabled; use team name editor for labels. */
  structureLocked?: boolean;
  onSave: (patch: {
    teams: string[];
    rounds: BracketRound[];
    bracketFormat: BracketSpec["bracketFormat"];
    rosterAgeGroup?: string | null;
  }) => Promise<void>;
};

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`;
}

export default function BracketStructureEditor({
  spec,
  projectId,
  projectUpdatedAt,
  organizationId,
  seasonYear,
  busy,
  structureLocked = false,
  onSave,
}: Props) {
  const [bracketFormat, setBracketFormat] = useState<BracketSpec["bracketFormat"]>(spec.bracketFormat);
  const [teams, setTeams] = useState<string[]>([]);
  const [rosterAgeGroup, setRosterAgeGroup] = useState("");
  const [rounds, setRounds] = useState<BracketRound[]>([]);

  useEffect(() => {
    setBracketFormat(spec.bracketFormat);
    setTeams(spec.teams.filter(Boolean));
    setRosterAgeGroup(spec.rosterAgeGroup?.trim() ?? "");
    setRounds(
      spec.rounds.length > 0
        ? spec.rounds.map((r) => ({
            ...r,
            matches: r.matches.map((m) => ({ ...m })),
          }))
        : [],
    );
  }, [projectId, projectUpdatedAt, spec.bracketFormat, spec.rosterAgeGroup, spec.teams, spec.rounds]);

  async function handleSave() {
    const hadRounds = spec.rounds.some((r) => r.matches.length > 0);
    if (hadRounds && !rounds.some((r) => r.matches.length > 0)) {
      window.alert(
        "Cannot save: bracket rounds are empty in the editor. Reload the page and try again before saving schedule changes.",
      );
      return;
    }
    const patch: {
      teams: string[];
      rounds: BracketRound[];
      bracketFormat: BracketSpec["bracketFormat"];
      rosterAgeGroup?: string;
    } = { teams, rounds, bracketFormat };
    const roster = rosterAgeGroup.trim();
    if (roster) patch.rosterAgeGroup = roster;
    await onSave(patch);
  }

  function handleGenerateRoundsFromTeams() {
    if (!canAutoGenerateSingleEliminationRounds(teams, bracketFormat)) return;
    if (rounds.length > 0) {
      const ok = window.confirm(
        "Replace all existing rounds with an auto-built single-elimination bracket from your team list?",
      );
      if (!ok) return;
    }
    setRounds(generateSingleEliminationRoundsFromTeams(teams));
  }

  function addRound() {
    setRounds((prev) => [
      ...prev,
      {
        id: newId("round"),
        label: `Round ${prev.length + 1}`,
        matches: [{ id: newId("m"), home: "Home", away: "Away" }],
      },
    ]);
  }

  function removeRound(roundIndex: number) {
    setRounds((prev) => prev.filter((_, i) => i !== roundIndex));
  }

  function updateRoundLabel(roundIndex: number, label: string) {
    setRounds((prev) => prev.map((r, i) => (i === roundIndex ? { ...r, label } : r)));
  }

  function addMatch(roundIndex: number) {
    setRounds((prev) =>
      prev.map((r, i) =>
        i === roundIndex
          ? { ...r, matches: [...r.matches, { id: newId("m"), home: "Home", away: "Away" }] }
          : r,
      ),
    );
  }

  function removeMatch(roundIndex: number, matchIndex: number) {
    setRounds((prev) =>
      prev.map((r, i) =>
        i === roundIndex ? { ...r, matches: r.matches.filter((_: BracketMatch, j: number) => j !== matchIndex) } : r,
      ),
    );
  }

  function updateMatch(roundIndex: number, matchIndex: number, field: "home" | "away", value: string) {
    setRounds((prev) =>
      prev.map((r, ri) => {
        if (ri !== roundIndex) return r;
        return {
          ...r,
          matches: r.matches.map((m: BracketMatch, mi: number) =>
            mi === matchIndex ? { ...m, [field]: value } : m,
          ),
        };
      }),
    );
  }

  function updateOfficialGameNumber(roundIndex: number, matchIndex: number, value: string) {
    const trimmed = value.trim();
    setRounds((prev) =>
      prev.map((r, ri) => {
        if (ri !== roundIndex) return r;
        return {
          ...r,
          matches: r.matches.map((m: BracketMatch, mi: number) => {
            if (mi !== matchIndex) return m;
            if (!trimmed) {
              const next = { ...m };
              delete next.officialGameNumber;
              return next;
            }
            return { ...m, officialGameNumber: trimmed };
          }),
        };
      }),
    );
  }

  function updateMatchSchedule(
    roundIndex: number,
    matchIndex: number,
    field: "dateLabel" | "time" | "venue" | "field",
    value: string,
  ) {
    const trimmed = value.trim();
    setRounds((prev) =>
      prev.map((r, ri) => {
        if (ri !== roundIndex) return r;
        return {
          ...r,
          matches: r.matches.map((m: BracketMatch, mi: number) => {
            if (mi !== matchIndex) return m;
            if (!trimmed) {
              const next = { ...m };
              delete next[field];
              return next;
            }
            return { ...m, [field]: trimmed };
          }),
        };
      }),
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Bracket structure</h2>
      <p className="mt-1 text-xs text-zinc-500">
        {structureLocked ? (
          <>
            This bracket is published. Use <strong className="text-zinc-400">Team names</strong> above to rename teams
            without changing scores or layout. Schedule and game numbers below can still be updated.
          </>
        ) : (
          <>
            Set bracket format and teams from the league roster for this age group, then build rounds automatically for
            single elimination (field sizes {getSupportedSingleElimAutoSizes().join(", ")} — non–power-of-two lists pad
            with trailing <strong className="text-zinc-400">BYE</strong> for higher seeds). You can still edit
            rounds by hand. Optional <strong className="text-zinc-400">official game #</strong> per match (from a
            published schedule) overrides automatic numbers in <strong className="text-zinc-400">G…</strong> row headers
            and <strong className="text-zinc-400">W…</strong> feeder labels when the bracket halves each round. Optional{" "}
            <strong className="text-zinc-400">date, time, field, park</strong> lines print on each game card.
          </>
        )}
      </p>

      <label className="mt-3 block text-xs font-medium text-zinc-400">
        Bracket format
        <select
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
          value={bracketFormat}
          disabled={busy || structureLocked}
          onChange={(e) => setBracketFormat(e.target.value as BracketSpec["bracketFormat"])}
        >
          <option value="unknown">Unknown</option>
          <option value="single_elimination">Single elimination</option>
          <option value="double_elimination">Double elimination</option>
          <option value="pool_play">Pool play</option>
          <option value="custom">Custom</option>
        </select>
      </label>

      {!structureLocked ? (
        <BracketTeamPicker
          organizationId={organizationId}
          seasonYear={seasonYear}
          busy={busy}
          selectedTeamNames={teams}
          onSelectedTeamNamesChange={setTeams}
          rosterAgeGroup={rosterAgeGroup}
          championAgeGroupLabel={spec.championAgeGroupLabel}
          divisionLabel={spec.divisionLabel}
          onAgeGroupChange={setRosterAgeGroup}
        />
      ) : null}

      {bracketFormat === "single_elimination" && !structureLocked ? (
        <div className="mt-3">
          <button
            type="button"
            disabled={busy || !canAutoGenerateSingleEliminationRounds(teams, bracketFormat)}
            className="rounded-lg border border-emerald-700/60 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-40"
            onClick={() => handleGenerateRoundsFromTeams()}
          >
            Build rounds from teams (single elimination)
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {rounds.map((round, ri) => (
          <div key={round.id} className="rounded-lg border border-zinc-700 bg-zinc-950/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-sm"
                value={round.label}
                disabled={busy}
                onChange={(e) => updateRoundLabel(ri, e.target.value)}
              />
              <button
                type="button"
                disabled={busy || structureLocked}
                className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                onClick={() => addMatch(ri)}
              >
                + Match
              </button>
              <button
                type="button"
                disabled={busy || structureLocked}
                className="rounded border border-red-900/50 px-2 py-1 text-xs text-red-300 hover:bg-red-950/40"
                onClick={() => removeRound(ri)}
              >
                Remove round
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {round.matches.map((m: BracketMatch, mi: number) => (
                <li key={m.id} className="flex flex-col gap-2 rounded border border-zinc-800/80 bg-zinc-950/40 p-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="min-w-[6rem] flex-1 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                      value={m.home}
                      disabled={busy || structureLocked}
                      onChange={(e) => updateMatch(ri, mi, "home", e.target.value)}
                      aria-label={`Round ${ri + 1} match ${mi + 1} home`}
                    />
                    <span className="text-zinc-500">vs</span>
                    <input
                      className="min-w-[6rem] flex-1 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                      value={m.away}
                      disabled={busy || structureLocked}
                      onChange={(e) => updateMatch(ri, mi, "away", e.target.value)}
                      aria-label={`Round ${ri + 1} match ${mi + 1} away`}
                    />
                    <label className="flex items-center gap-1 text-[11px] text-zinc-500">
                      <span className="shrink-0">Game #</span>
                      <input
                        className="w-14 rounded border border-zinc-600 bg-zinc-950 px-1.5 py-1 text-xs tabular-nums"
                        value={m.officialGameNumber ?? ""}
                        disabled={busy}
                        placeholder="—"
                        onChange={(e) => updateOfficialGameNumber(ri, mi, e.target.value)}
                        aria-label={`Round ${ri + 1} match ${mi + 1} official published game number`}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || structureLocked || round.matches.length < 2}
                      className="text-xs text-zinc-500 hover:text-red-300 disabled:opacity-30"
                      onClick={() => removeMatch(ri, mi)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="text-[10px] text-zinc-500">
                      Date
                      <input
                        className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[11px]"
                        value={m.dateLabel ?? ""}
                        disabled={busy}
                        placeholder="Sat 6/7"
                        onChange={(e) => updateMatchSchedule(ri, mi, "dateLabel", e.target.value)}
                      />
                    </label>
                    <label className="text-[10px] text-zinc-500">
                      Time
                      <input
                        className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[11px]"
                        value={m.time ?? ""}
                        disabled={busy}
                        placeholder="6:00 PM"
                        maxLength={80}
                        onChange={(e) => updateMatchSchedule(ri, mi, "time", e.target.value)}
                      />
                    </label>
                    <label className="text-[10px] text-zinc-500">
                      Field
                      <input
                        className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[11px]"
                        value={m.field ?? ""}
                        disabled={busy}
                        placeholder="Field 2"
                        onChange={(e) => updateMatchSchedule(ri, mi, "field", e.target.value)}
                      />
                    </label>
                    <label className="text-[10px] text-zinc-500">
                      Park / venue
                      <input
                        className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-[11px]"
                        value={m.venue ?? ""}
                        disabled={busy}
                        placeholder="Main complex"
                        onChange={(e) => updateMatchSchedule(ri, mi, "venue", e.target.value)}
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!structureLocked ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold hover:bg-zinc-800"
            onClick={() => addRound()}
          >
            Add round
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600"
          onClick={() => void handleSave()}
        >
          {structureLocked ? "Save schedule & game numbers" : "Save bracket structure"}
        </button>
      </div>
    </div>
  );
}
