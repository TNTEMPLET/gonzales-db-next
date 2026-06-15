import type { BracketMatch, BracketRound, BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { includesIfNecessaryChampionshipGame } from "@/lib/tournament-brackets/bracketFormat";
import { isClassicFiveTeamParticipantShell } from "@/lib/tournament-brackets/doubleEliminationClassicLayoutTemplate";
import {
  BYE_SLOT_LABEL,
  expandTeamsWithTopSeedByes,
  getSupportedSingleElimAutoSizes,
  nextPowerOfTwoAtLeast,
  SINGLE_ELIM_FIRST_ROUND_PAIRINGS,
} from "@/lib/tournament-brackets/generateSingleElimFromTeams";

const MAX_AUTO_BRACKET = 32;

export type GenerateDoubleElimOptions = {
  /** Pre-placed participants in bracket shell slot order (length must be a supported power of two). */
  participantSlots?: string[];
  /** When false, championship is a single winner-take-all grand final (no if-necessary game). */
  includeIfNecessaryGame?: boolean;
};

/**
 * District 6 10U fixed shell: G1 Ponchatoula vs Loranger, G2 Kentwood vs Franklinton,
 * Gonzales bye (hidden), BYE vs BYE (hidden).
 */
export function district6TenUParticipantSlots(): string[] {
  return [
    "Ponchatoula",
    BYE_SLOT_LABEL,
    "Gonzales",
    "Kentwood",
    "Franklinton",
    BYE_SLOT_LABEL,
    BYE_SLOT_LABEL,
    "Loranger",
  ];
}

/** Winners advancement for District 6 10U: W(G1) vs Gonzales, W(G2) vs BYE path. */
export const DISTRICT6_TEN_U_WINNERS_NEXT_PAIRINGS: number[][][] = [
  [[0, 3], [1, 2]],
  [[0, 1]],
];

export function isDistrict6TenUParticipantSlots(slots: string[]): boolean {
  const d6 = district6TenUParticipantSlots();
  return slots.length === d6.length && slots.every((s, i) => s === d6[i]);
}

function newMatchId(section: "w" | "l" | "c", roundIdx: number, matchIdx: number): string {
  const suffix =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : String(Date.now() + roundIdx * 100 + matchIdx);
  return `de-${section}-r${roundIdx}-m${matchIdx}-${suffix}`;
}

function newRoundId(section: "w" | "l" | "c", roundIdx: number): string {
  const suffix =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : String(Date.now() + roundIdx);
  return `de-${section}-r${roundIdx}-${suffix}`;
}

function winnersRoundLabel(matchCount: number): string {
  if (matchCount === 1) return "Winners Bracket — Final";
  if (matchCount === 2) return "Winners Bracket — Semifinals";
  return "Winners Bracket — Round 1";
}

function isByeOnlyMatch(home: string, away: string): boolean {
  const h = home.trim();
  const a = away.trim();
  return h === BYE_SLOT_LABEL || a === BYE_SLOT_LABEL;
}

function advancingTeamFromBye(home: string, away: string): string {
  const h = home.trim();
  const a = away.trim();
  if (h === BYE_SLOT_LABEL && a === BYE_SLOT_LABEL) return BYE_SLOT_LABEL;
  if (h === BYE_SLOT_LABEL) return away;
  if (a === BYE_SLOT_LABEL) return home;
  return home;
}

function winnerFeeder(m: BracketMatch): string {
  if (isByeOnlyMatch(m.home, m.away)) return advancingTeamFromBye(m.home, m.away);
  const g = m.officialGameNumber?.trim();
  return g ? `W${g}` : advancingTeamFromBye(m.home, m.away);
}

function loserFeeder(m: BracketMatch): string | null {
  if (isByeOnlyMatch(m.home, m.away)) return null;
  const g = m.officialGameNumber?.trim();
  return g ? `L${g}` : null;
}

function assignLiveGameNumber(nextLive: { value: number }): string {
  return String(nextLive.value++);
}

function buildWinnersBracket(
  participants: string[],
  N: number,
  nextLive: { value: number },
  nextRoundPairings?: number[][][],
): { rounds: BracketRound[]; finalMatch: BracketMatch } {
  const pairs = SINGLE_ELIM_FIRST_ROUND_PAIRINGS[N];
  if (!pairs) throw new Error(`Unsupported bracket size ${N}`);

  let prevMatches: BracketMatch[] = pairs.map(([i, j], idx) => {
    const home = participants[i] ?? "TBD";
    const away = participants[j] ?? "TBD";
    const match: BracketMatch = {
      id: newMatchId("w", 0, idx),
      home,
      away,
    };
    if (!isByeOnlyMatch(home, away)) {
      match.officialGameNumber = assignLiveGameNumber(nextLive);
    }
    return match;
  });

  const rounds: BracketRound[] = [
    {
      id: newRoundId("w", 0),
      label: winnersRoundLabel(prevMatches.length),
      bracketSection: "winners",
      matches: prevMatches,
    },
  ];

  let roundIndex = 1;
  while (prevMatches.length > 1) {
    const pairings =
      nextRoundPairings?.[roundIndex - 1] ??
      Array.from({ length: prevMatches.length / 2 }, (_, i) => [i * 2, i * 2 + 1]);

    const next: BracketMatch[] = [];
    for (const [leftIdx, rightIdx] of pairings) {
      const home = winnerFeeder(prevMatches[leftIdx]!);
      const away = winnerFeeder(prevMatches[rightIdx]!);
      const match: BracketMatch = {
        id: newMatchId("w", roundIndex, next.length),
        home,
        away,
      };
      if (!isByeOnlyMatch(home, away)) {
        match.officialGameNumber = assignLiveGameNumber(nextLive);
      }
      next.push(match);
    }
    rounds.push({
      id: newRoundId("w", roundIndex),
      label: winnersRoundLabel(next.length),
      bracketSection: "winners",
      matches: next,
    });
    prevMatches = next;
    roundIndex += 1;
  }

  return { rounds, finalMatch: prevMatches[0]! };
}

function losersRoundLabel(roundIdx: number, matchCount: number, totalRounds: number): string {
  if (roundIdx === totalRounds - 1) return "Losers Bracket — Final";
  return matchCount === 1 ? "Losers Bracket" : `Losers Bracket — Round ${roundIdx + 1}`;
}

function buildLosersBracket(
  winnersRounds: BracketRound[],
  N: number,
  nextLive: { value: number },
): BracketRound[] {
  const k = Math.log2(N);
  const wr1 = winnersRounds[0]!.matches;
  const rounds: BracketRound[] = [];
  let roundIdx = 0;

  const lr1Matches: BracketMatch[] = [];
  const lr1Losers: string[] = [];
  for (const m of wr1) {
    const l = loserFeeder(m);
    if (l) lr1Losers.push(l);
  }
  for (let i = 0; i < lr1Losers.length; i += 2) {
    const lHome = lr1Losers[i];
    const lAway = lr1Losers[i + 1];
    if (!lHome || !lAway) continue;
    lr1Matches.push({
      id: newMatchId("l", roundIdx, lr1Matches.length),
      home: lHome,
      away: lAway,
      officialGameNumber: assignLiveGameNumber(nextLive),
    });
  }

  if (lr1Matches.length > 0) {
    rounds.push({
      id: newRoundId("l", roundIdx),
      label: losersRoundLabel(roundIdx, lr1Matches.length, 2 * k - 2),
      bracketSection: "losers",
      matches: lr1Matches,
    });
    roundIdx += 1;
  }

  let prevRoundMatches = lr1Matches;

  for (let wbDropRound = 2; wbDropRound <= k; wbDropRound++) {
    const wbRound = winnersRounds[wbDropRound - 1]!.matches;
    const dropMatches: BracketMatch[] = [];

    if (prevRoundMatches.length === 0) {
      for (const wbMatch of wbRound) {
        const lSide = loserFeeder(wbMatch);
        if (!lSide) continue;
        dropMatches.push({
          id: newMatchId("l", roundIdx, dropMatches.length),
          home: lSide,
          away: "TBD",
          officialGameNumber: assignLiveGameNumber(nextLive),
        });
      }
    } else {
      for (let i = 0; i < prevRoundMatches.length; i++) {
        const wbMatch = wbRound[prevRoundMatches.length - 1 - i];
        if (!wbMatch) continue;
        const lSide = loserFeeder(wbMatch);
        if (!lSide) continue;
        const prevWinner = winnerFeeder(prevRoundMatches[i]!);
        const prevHome = prevRoundMatches[i]!.home.trim();
        const prevAway = prevRoundMatches[i]!.away.trim();
        const prevIsDropRound = prevHome.startsWith("W") && prevAway.startsWith("L");
        const home = prevIsDropRound ? lSide : prevWinner;
        const away = prevIsDropRound ? prevWinner : lSide;
        const match: BracketMatch = {
          id: newMatchId("l", roundIdx, dropMatches.length),
          home,
          away,
        };
        if (!isByeOnlyMatch(home, away)) {
          match.officialGameNumber = assignLiveGameNumber(nextLive);
        }
        dropMatches.push(match);
      }
    }

    if (dropMatches.length > 0) {
      rounds.push({
        id: newRoundId("l", roundIdx),
        label: losersRoundLabel(roundIdx, dropMatches.length, 2 * k - 2),
        bracketSection: "losers",
        matches: dropMatches,
      });
      roundIdx += 1;
    }

    if (wbDropRound < k) {
      const consMatches: BracketMatch[] = [];
      const half = Math.floor(dropMatches.length / 2);
      for (let i = 0; i < half; i++) {
        const home = winnerFeeder(dropMatches[i]!);
        const away = winnerFeeder(dropMatches[i + half]!);
        const match: BracketMatch = {
          id: newMatchId("l", roundIdx, consMatches.length),
          home,
          away,
        };
        if (!isByeOnlyMatch(home, away)) {
          match.officialGameNumber = assignLiveGameNumber(nextLive);
        }
        consMatches.push(match);
      }
      if (consMatches.length > 0) {
        rounds.push({
          id: newRoundId("l", roundIdx),
          label: losersRoundLabel(roundIdx, consMatches.length, 2 * k - 2),
          bracketSection: "losers",
          matches: consMatches,
        });
        roundIdx += 1;
        prevRoundMatches = consMatches;
      } else if (dropMatches.length > 0) {
        prevRoundMatches = dropMatches;
      }
    } else {
      prevRoundMatches = dropMatches;
    }
  }

  return rounds;
}

function buildChampionshipRound(
  wbFinal: BracketMatch,
  lbFinal: BracketMatch,
  nextLive: { value: number },
  includeIfNecessary: boolean,
): BracketRound {
  const gfNum = assignLiveGameNumber(nextLive);
  const matches: BracketMatch[] = [
    {
      id: newMatchId("c", 0, 0),
      home: winnerFeeder(wbFinal),
      away: winnerFeeder(lbFinal),
      officialGameNumber: gfNum,
      championshipRole: "grand_final",
    },
  ];
  if (includeIfNecessary) {
    const resetNum = assignLiveGameNumber(nextLive);
    matches.push({
      id: newMatchId("c", 0, 1),
      home: `W${gfNum}`,
      away: `L${gfNum}`,
      officialGameNumber: resetNum,
      championshipRole: "if_necessary",
    });
  }
  return {
    id: newRoundId("c", 0),
    label: includeIfNecessary ? "Championship Series" : "Championship",
    bracketSection: "championship",
    matches,
  };
}

/**
 * Minimum games for a power-of-two double-elimination bracket (WB champ wins GF1).
 */
export function countDoubleElimGamesMin(n: number): number {
  return 2 * n - 2;
}

/**
 * Maximum games for a power-of-two double-elimination bracket (LB champ forces reset).
 */
export function countDoubleElimGamesMax(n: number): number {
  return 2 * n - 1;
}

export function getSupportedDoubleElimAutoSizes(): number[] {
  return getSupportedSingleElimAutoSizes();
}

export function canAutoGenerateDoubleEliminationRounds(
  teams: string[],
  bracketFormat: BracketSpec["bracketFormat"],
): boolean {
  if (bracketFormat !== "double_elimination" && bracketFormat !== "modified_double_elimination") {
    return false;
  }
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length < 2) return false;
  const N = nextPowerOfTwoAtLeast(t.length);
  return N <= MAX_AUTO_BRACKET && Boolean(SINGLE_ELIM_FIRST_ROUND_PAIRINGS[N]);
}

/**
 * Builds a full double-elimination `rounds` tree from a seeded team list (best seed first).
 * Non–power-of-two counts are padded with `BYE` using {@link expandTeamsWithTopSeedByes}.
 */
export function generateDoubleEliminationRoundsFromTeams(
  teams: string[],
  options?: GenerateDoubleElimOptions,
): BracketRound[] {
  const slots = options?.participantSlots;
  const participants =
    slots?.length > 0
      ? slots
      : expandTeamsWithTopSeedByes(teams);
  const N = participants.length;
  if (!SINGLE_ELIM_FIRST_ROUND_PAIRINGS[N]) {
    throw new Error(
      `Cannot auto-build double elimination for ${N} slots. Supported: ${getSupportedDoubleElimAutoSizes().join(", ")}.`,
    );
  }

  const nextLive = { value: 1 };
  const winnersNextPairings =
    slots?.length &&
    (isDistrict6TenUParticipantSlots(slots) || isClassicFiveTeamParticipantShell(slots))
      ? DISTRICT6_TEN_U_WINNERS_NEXT_PAIRINGS
      : undefined;
  const { rounds: winnersRounds, finalMatch: wbFinal } = buildWinnersBracket(
    participants,
    N,
    nextLive,
    winnersNextPairings,
  );
  const losersRounds = buildLosersBracket(winnersRounds, N, nextLive);
  const lbFinal = losersRounds.flatMap((r) => r.matches).filter((m) => m.officialGameNumber).at(-1);
  if (!lbFinal) {
    throw new Error("Failed to build losers bracket final.");
  }
  const championshipRound = buildChampionshipRound(
    wbFinal,
    lbFinal,
    nextLive,
    options?.includeIfNecessaryGame !== false,
  );

  return [...winnersRounds, ...losersRounds, championshipRound];
}

/** Builds double-elim rounds for a bracket format (standard vs modified championship). */
export function generateDoubleEliminationRoundsForFormat(
  teams: string[],
  bracketFormat: BracketSpec["bracketFormat"],
  options?: Omit<GenerateDoubleElimOptions, "includeIfNecessaryGame">,
): BracketRound[] {
  return generateDoubleEliminationRoundsFromTeams(teams, {
    ...options,
    includeIfNecessaryGame: includesIfNecessaryChampionshipGame(bracketFormat),
  });
}

/** For UI copy: number of bye slots added for this team count. */
export function countByesForDoubleElimTeamList(teams: string[]): number {
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length < 1) return 0;
  const N = nextPowerOfTwoAtLeast(t.length);
  if (N > MAX_AUTO_BRACKET || !SINGLE_ELIM_FIRST_ROUND_PAIRINGS[N]) return 0;
  return N - t.length;
}

export { BYE_SLOT_LABEL };
