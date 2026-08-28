import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { isBracketFeederPlaceholder, isByeSide } from "@/lib/tournament-brackets/bracketScoring";

export type TeamLabelRename = {
  from: string;
  to: string;
};

function replaceExactLabel(label: string, from: string, to: string): string {
  return label.trim() === from ? to : label;
}

/** Distinct team labels on the bracket (excludes BYE, TBD, W/L feeders). */
export function collectEditableTeamLabels(spec: BracketSpec): string[] {
  const labels = new Set<string>();

  function add(label: string) {
    const trimmed = label.trim();
    if (!trimmed || isBracketFeederPlaceholder(trimmed) || isByeSide(trimmed)) return;
    labels.add(trimmed);
  }

  for (const team of spec.teams) add(team);
  for (const round of spec.rounds) {
    for (const match of round.matches) {
      add(match.home);
      add(match.away);
    }
  }
  if (spec.thirdPlaceGame) {
    add(spec.thirdPlaceGame.home);
    add(spec.thirdPlaceGame.away);
  }

  return [...labels].sort((a, b) => a.localeCompare(b, "en-US", { sensitivity: "base" }));
}

/** Rename one label everywhere it appears. Scores, match ids, and round shape are unchanged. */
export function renameTeamLabelInSpec(spec: BracketSpec, fromLabel: string, toLabel: string): BracketSpec {
  const from = fromLabel.trim();
  const to = toLabel.trim();
  if (!from || !to || from === to) return spec;
  if (isBracketFeederPlaceholder(from) || isByeSide(from)) return spec;

  const rounds = spec.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => ({
      ...match,
      home: replaceExactLabel(match.home, from, to),
      away: replaceExactLabel(match.away, from, to),
    })),
  }));

  const teams = spec.teams.map((team) => replaceExactLabel(team, from, to));

  let thirdPlaceGame = spec.thirdPlaceGame;
  if (thirdPlaceGame) {
    thirdPlaceGame = {
      ...thirdPlaceGame,
      home: replaceExactLabel(thirdPlaceGame.home, from, to),
      away: replaceExactLabel(thirdPlaceGame.away, from, to),
    };
  }

  return {
    ...spec,
    rounds,
    teams,
    ...(thirdPlaceGame ? { thirdPlaceGame } : {}),
  };
}

export function applyTeamLabelRenames(spec: BracketSpec, renames: TeamLabelRename[]): BracketSpec {
  return renames.reduce((next, { from, to }) => renameTeamLabelInSpec(next, from, to), spec);
}

export function teamLabelRenamesFromDraft(
  originals: string[],
  draftByOriginal: Record<string, string>,
): TeamLabelRename[] {
  const out: TeamLabelRename[] = [];
  for (const from of originals) {
    const to = draftByOriginal[from]?.trim() ?? "";
    if (!to || to === from) continue;
    if (isBracketFeederPlaceholder(to) || isByeSide(to)) continue;
    out.push({ from, to });
  }
  return out;
}

export function specPatchFromTeamRenames(spec: BracketSpec, renames: TeamLabelRename[]): Record<string, unknown> {
  const next = applyTeamLabelRenames(spec, renames);
  const patch: Record<string, unknown> = {
    rounds: next.rounds,
    teams: next.teams,
  };
  if (next.thirdPlaceGame) {
    patch.thirdPlaceGame = next.thirdPlaceGame;
  }
  return patch;
}
