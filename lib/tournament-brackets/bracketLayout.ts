import { formatSemiLoserSlotLabel, formatWinnerFeederSlotLabel } from "@/lib/tournament-brackets/bracketDisplayLabels";
import { isBracketFeederPlaceholder } from "@/lib/tournament-brackets/bracketScoring";
import type { BracketGameRow, BracketMatch, BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { BYE_SLOT_LABEL, generateSingleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

/** One row in a classic column bracket (home/away are stored labels; slots are what we render). */
export type LayoutMatch = {
  id: string;
  home: string;
  away: string;
  /** Optional published/schedule game # for `G…` / `W…` slot labels. */
  officialGameNumber?: string;
  /** Bracket-wide game number among **non-bye** games only (round-major). Set when `treeLayout === "connected"`. */
  bracketGameNumber?: number;
  slotHome: string;
  slotAway: string;
  homeScore?: number;
  awayScore?: number;
  winnerSide?: "home" | "away";
  /** Date line for the game card (from bracket structure). */
  dateLabel?: string;
  time?: string;
  venue?: string;
  field?: string;
  /**
   * Connected grid: index in the canonical single-elim band for this round (0 .. layoutSlotCount-1).
   * Used when some slots are empty because a bye-only match was hidden.
   */
  canonicalSlotIndex?: number;
};

export type LayoutRound = {
  id: string;
  label: string;
  matches: LayoutMatch[];
  /**
   * Connected bracket: number of vertical grid bands for this round (includes hidden bye-only slots).
   * When unset, equals `matches.length` (no holes).
   */
  layoutSlotCount?: number;
};

export type BracketLayoutPodium = {
  /** e.g. `12U Champion` */
  championHeading: string;
  finalMatch: LayoutMatch;
  thirdPlaceSlotHome: string;
  thirdPlaceSlotAway: string;
  thirdPlaceScores?: {
    homeScore?: number;
    awayScore?: number;
    winnerSide?: "home" | "away";
  };
};

export type BracketLayout =
  | { mode: "empty"; title?: string; message: string }
  | {
      mode: "tree";
      divisionLabel?: string;
      rounds: LayoutRound[];
      /** `connected`: elimination halving + SVG connectors + `Wn` feeder slot labels. */
      treeLayout: "flat" | "connected";
      /** Leaf row count for the connected CSS grid (full first-round width). */
      connectedLaneRowCount?: number;
      /** Single elim + opt-in: champion + 3rd place column (no connectors on 3rd game). */
      podium?: BracketLayoutPodium | null;
    }
  | { mode: "match_grid"; divisionLabel?: string; games: BracketGameRow[] };

function hasStructuredRounds(spec: BracketSpec): boolean {
  return spec.rounds.some((r) => r.matches.length > 0);
}

/** True when each round has half as many matches as the previous (single-elim column shape). */
export function isHalvingEliminationBracket(rounds: LayoutRound[]): boolean {
  const r = rounds.filter((x) => x.matches.length > 0);
  if (r.length < 2) return false;
  for (let i = 1; i < r.length; i++) {
    const prev = r[i - 1]!.matches.length;
    const curr = r[i]!.matches.length;
    if (prev !== 2 * curr) return false;
  }
  return true;
}

function isByeMatch(m: Pick<LayoutMatch, "home" | "away">): boolean {
  const h = m.home.trim();
  const a = m.away.trim();
  return h === BYE_SLOT_LABEL || a === BYE_SLOT_LABEL;
}

/** Team that auto-advances from a bye match (home vs BYE or BYE vs away). */
function advancingTeamFromByeMatch(m: Pick<LayoutMatch, "home" | "away">): string {
  const h = m.home.trim();
  const a = m.away.trim();
  if (h === BYE_SLOT_LABEL && a === BYE_SLOT_LABEL) return BYE_SLOT_LABEL;
  if (h === BYE_SLOT_LABEL) return m.away;
  if (a === BYE_SLOT_LABEL) return m.home;
  return m.home;
}

function baseMatch(m: BracketMatch): LayoutMatch {
  return {
    id: m.id,
    home: m.home,
    away: m.away,
    officialGameNumber: m.officialGameNumber,
    slotHome: m.home,
    slotAway: m.away,
    ...(m.homeScore != null ? { homeScore: m.homeScore } : {}),
    ...(m.awayScore != null ? { awayScore: m.awayScore } : {}),
    ...(m.winnerSide ? { winnerSide: m.winnerSide } : {}),
    ...(m.dateLabel ? { dateLabel: m.dateLabel } : {}),
    ...(m.time ? { time: m.time } : {}),
    ...(m.venue ? { venue: m.venue } : {}),
    ...(m.field ? { field: m.field } : {}),
  };
}

function filterByeMatchesFromRounds(rounds: LayoutRound[]): LayoutRound[] {
  return rounds.map((r) => ({
    ...r,
    matches: r.matches.filter((m) => !isByeMatch(m)),
  }));
}

/**
 * Single-elim connected layout: hide bye-only matches in every round, advance that team into the
 * feeder slot text for the next round, renumber “Game N” among non-bye games only, and keep a
 * canonical grid width so connectors stay aligned (empty bands where a bye-only match was removed).
 */
export function buildConnectedHalvingDisplayedRounds(baseRounds: LayoutRound[]): {
  rounds: LayoutRound[];
  connectedLaneRowCount: number;
} {
  const R = baseRounds.length;
  const n0 = baseRounds[0]?.matches.length ?? 0;
  if (R === 0 || n0 === 0) {
    return { rounds: baseRounds, connectedLaneRowCount: n0 };
  }

  const bracketNum = new Map<string, number>();
  let seq = 1;
  for (let ri = 0; ri < R; ri++) {
    const row = baseRounds[ri]!.matches;
    for (let j = 0; j < row.length; j++) {
      const m = row[j]!;
      if (!isByeMatch(m)) {
        bracketNum.set(`${ri}:${j}`, seq++);
      }
    }
  }

  function feederSlotLabel(childRoundIndex: number, childMatchIndex: number): string {
    const m = baseRounds[childRoundIndex]!.matches[childMatchIndex]!;
    if (isByeMatch(m)) {
      return advancingTeamFromByeMatch(m);
    }
    const num = bracketNum.get(`${childRoundIndex}:${childMatchIndex}`);
    if (num == null) {
      return advancingTeamFromByeMatch(m);
    }
    return formatWinnerFeederSlotLabel(m, num);
  }

  const outRounds: LayoutRound[] = [];

  for (let ri = 0; ri < R; ri++) {
    const src = baseRounds[ri]!;
    const layoutSlotCount = src.matches.length;
    const matches: LayoutMatch[] = [];

    for (let j = 0; j < layoutSlotCount; j++) {
      const m = src.matches[j]!;
      if (isByeMatch(m)) continue;

      let slotHome: string;
      let slotAway: string;
      if (ri === 0) {
        slotHome = m.home;
        slotAway = m.away;
      } else {
        const specHome = m.home.trim();
        const specAway = m.away.trim();
        slotHome = isBracketFeederPlaceholder(specHome)
          ? feederSlotLabel(ri - 1, 2 * j)
          : specHome;
        slotAway = isBracketFeederPlaceholder(specAway)
          ? feederSlotLabel(ri - 1, 2 * j + 1)
          : specAway;
      }

      const bgn = bracketNum.get(`${ri}:${j}`);
      matches.push({
        ...m,
        slotHome,
        slotAway,
        bracketGameNumber: bgn,
        canonicalSlotIndex: j,
      });
    }

    outRounds.push({
      id: src.id,
      label: src.label,
      matches,
      layoutSlotCount,
    });
  }

  return { rounds: outRounds, connectedLaneRowCount: n0 };
}

/**
 * Single elim + opt-in: structural semi-finals = penultimate round with exactly two matches feeding one final.
 */
export function computePodiumForSingleElimTree(
  spec: BracketSpec,
  rounds: LayoutRound[],
): BracketLayoutPodium | null {
  if (spec.bracketFormat !== "single_elimination" || spec.singleElimIncludeThirdPlace !== true) {
    return null;
  }
  const r = rounds.filter((x) => x.matches.length > 0);
  if (r.length < 2) return null;
  const finalRound = r[r.length - 1]!;
  const semiRound = r[r.length - 2]!;
  if (finalRound.matches.length !== 1 || semiRound.matches.length !== 2) return null;
  const finalMatch = finalRound.matches[0]!;
  const sm0 = semiRound.matches[0]!;
  const sm1 = semiRound.matches[1]!;
  const age =
    spec.championAgeGroupLabel?.trim() ||
    spec.divisionLabel?.trim() ||
    "Tournament";
  const thirdHome =
    spec.thirdPlaceGame?.home?.trim() && !isBracketFeederPlaceholder(spec.thirdPlaceGame.home)
      ? spec.thirdPlaceGame.home.trim()
      : formatSemiLoserSlotLabel(sm0);
  const thirdAway =
    spec.thirdPlaceGame?.away?.trim() && !isBracketFeederPlaceholder(spec.thirdPlaceGame.away)
      ? spec.thirdPlaceGame.away.trim()
      : formatSemiLoserSlotLabel(sm1);

  return {
    championHeading: `${age} Champion`,
    finalMatch,
    thirdPlaceSlotHome: thirdHome,
    thirdPlaceSlotAway: thirdAway,
    thirdPlaceScores: spec.thirdPlaceGame
      ? {
          homeScore: spec.thirdPlaceGame.homeScore,
          awayScore: spec.thirdPlaceGame.awayScore,
          winnerSide: spec.thirdPlaceGame.winnerSide,
        }
      : undefined,
  };
}

function withTreePodium(
  base: {
    mode: "tree";
    divisionLabel?: string;
    rounds: LayoutRound[];
    treeLayout: "flat" | "connected";
    connectedLaneRowCount?: number;
  },
  spec: BracketSpec,
): BracketLayout {
  const podium = computePodiumForSingleElimTree(spec, base.rounds);
  return podium ? { ...base, podium } : base;
}

function layoutFromSpecRounds(spec: BracketSpec): BracketLayout {
  const rounds: LayoutRound[] = spec.rounds
    .filter((r) => r.matches.length > 0)
    .map((r) => ({
      id: r.id,
      label: r.label,
      matches: r.matches.map((m) => baseMatch(m)),
    }));
  if (rounds.length === 0) {
    return {
      mode: "empty",
      title: spec.divisionLabel,
      message: "No bracket rounds defined yet.",
    };
  }
  const connected = isHalvingEliminationBracket(rounds);
  if (connected) {
    const { rounds: out, connectedLaneRowCount } = buildConnectedHalvingDisplayedRounds(rounds);
    return withTreePodium(
      {
        mode: "tree",
        divisionLabel: spec.divisionLabel,
        rounds: out,
        treeLayout: "connected",
        connectedLaneRowCount,
      },
      spec,
    );
  }
  return withTreePodium(
    {
      mode: "tree",
      divisionLabel: spec.divisionLabel,
      rounds: filterByeMatchesFromRounds(rounds),
      treeLayout: "flat",
    },
    spec,
  );
}

/** Single-elim skeleton from seeded team list (uses standard first-round pairings + BYE padding). */
function buildSyntheticSingleElimRounds(teams: string[]): LayoutRound[] {
  const t = teams.filter((x) => x.trim().length > 0);
  if (t.length < 1) return [];
  try {
    const specRounds = generateSingleEliminationRoundsFromTeams(t);
    return specRounds.map((r) => ({
      id: r.id,
      label: r.label,
      matches: r.matches.map((m) => baseMatch(m)),
    }));
  } catch {
    return [];
  }
}

function layoutFromSeededSingleElim(spec: BracketSpec): BracketLayout | null {
  if (spec.bracketFormat !== "single_elimination") return null;
  const teams = spec.teams.filter((x) => x.trim().length > 0);
  if (teams.length < 1) return null;
  const roundsRaw = buildSyntheticSingleElimRounds(teams);
  if (roundsRaw.length === 0) return null;
  const { rounds, connectedLaneRowCount } = buildConnectedHalvingDisplayedRounds(roundsRaw);
  return withTreePodium(
    {
      mode: "tree",
      divisionLabel: spec.divisionLabel,
      rounds,
      treeLayout: "connected",
      connectedLaneRowCount,
    },
    spec,
  );
}

function layoutMatchGrid(spec: BracketSpec): BracketLayout {
  return {
    mode: "match_grid",
    divisionLabel: spec.divisionLabel,
    games: spec.games,
  };
}

function layoutEmpty(spec: BracketSpec): BracketLayout {
  return {
    mode: "empty",
    title: spec.divisionLabel,
    message:
      "Import games from an XLSX schedule, or use Bracket structure to define rounds for the column preview and exports.",
  };
}

/**
 * Normalizes BracketSpec into a layout for HTML/CSS rendering.
 * Priority: structured rounds → flat games grid → seeded single-elim (with BYE padding when needed) → empty.
 */
export function buildBracketLayout(spec: BracketSpec): BracketLayout {
  if (hasStructuredRounds(spec)) {
    return layoutFromSpecRounds(spec);
  }
  if (spec.games.length > 0) {
    return layoutMatchGrid(spec);
  }
  const seeded = layoutFromSeededSingleElim(spec);
  if (seeded) return seeded;
  return layoutEmpty(spec);
}
