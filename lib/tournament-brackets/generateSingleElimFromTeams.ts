import type { BracketMatch, BracketRound } from "@/lib/tournament-brackets/bracketSpec";

/** Placeholder name for an empty bracket slot (first-round bye). */
export const BYE_SLOT_LABEL = "BYE";

/** Smallest power of two ≥ n (minimum 2). */
export function nextPowerOfTwoAtLeast(n: number): number {
  if (n <= 1) return 2;
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard single-elimination first-round pairings (0-based seed indices).
 * Seeds are ordered best → worst in the participant list; pairings follow a fixed bracket shell.
 */
export const SINGLE_ELIM_FIRST_ROUND_PAIRINGS: Record<number, [number, number][]> = {
  2: [[0, 1]],
  4: [
    [0, 3],
    [1, 2],
  ],
  8: [
    [0, 7],
    [3, 4],
    [1, 6],
    [2, 5],
  ],
  16: [
    [0, 15],
    [7, 8],
    [4, 11],
    [3, 12],
    [2, 13],
    [5, 10],
    [6, 9],
    [1, 14],
  ],
  32: [
    [0, 31],
    [15, 16],
    [8, 23],
    [7, 24],
    [4, 27],
    [11, 20],
    [12, 19],
    [3, 28],
    [2, 29],
    [13, 18],
    [10, 21],
    [5, 26],
    [6, 25],
    [9, 22],
    [14, 17],
    [1, 30],
  ],
};

export function getSupportedSingleElimAutoSizes(): number[] {
  return Object.keys(SINGLE_ELIM_FIRST_ROUND_PAIRINGS).map(Number).sort((a, b) => a - b);
}

const MAX_AUTO_BRACKET = 32;

/**
 * True when guided / auto single-elim can run: padded field size is a supported bracket shell (≤ 32).
 */
export function canAutoGenerateSingleEliminationRounds(
  teams: string[],
  bracketFormat: "double_elimination" | "single_elimination" | "pool_play" | "custom" | "unknown",
): boolean {
  if (bracketFormat !== "single_elimination") return false;
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length < 1) return false;
  const N = nextPowerOfTwoAtLeast(t.length);
  return N <= MAX_AUTO_BRACKET && Boolean(SINGLE_ELIM_FIRST_ROUND_PAIRINGS[N]);
}

/**
 * Pads to the next power of two with trailing **BYE** slots so higher seeds (listed first) tend to draw
 * first-round byes when paired using `SINGLE_ELIM_FIRST_ROUND_PAIRINGS` (standard shell).
 */
export function expandTeamsWithTopSeedByes(teams: string[]): string[] {
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length < 1) {
    throw new Error("Need at least one team.");
  }
  const N = nextPowerOfTwoAtLeast(t.length);
  if (N > MAX_AUTO_BRACKET || !SINGLE_ELIM_FIRST_ROUND_PAIRINGS[N]) {
    throw new Error(
      `Bracket size ${N} is not supported for auto-build (max ${MAX_AUTO_BRACKET} slots). Add or remove teams.`,
    );
  }
  const byes = N - t.length;
  return [...t, ...Array(byes).fill(BYE_SLOT_LABEL)];
}

function newMatchId(roundIdx: number, matchIdx: number) {
  return `gen-r${roundIdx}-m${matchIdx}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : String(Date.now())}`;
}

function newRoundId(roundIdx: number) {
  return `gen-r${roundIdx}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : String(Date.now())}`;
}

/**
 * Builds a full single-elimination `rounds` tree from a seeded team list (best seed first).
 * Non–power-of-two counts are padded with `BYE` using {@link expandTeamsWithTopSeedByes}.
 */
export function generateSingleEliminationRoundsFromTeams(teams: string[]): BracketRound[] {
  const participants = expandTeamsWithTopSeedByes(teams);
  const N = participants.length;
  const pairs = SINGLE_ELIM_FIRST_ROUND_PAIRINGS[N];
  if (!pairs) {
    throw new Error(
      `Cannot auto-build single elimination for ${N} slots. Supported: ${getSupportedSingleElimAutoSizes().join(", ")}.`,
    );
  }

  let prevMatches: BracketMatch[] = pairs.map(([i, j], idx) => ({
    id: newMatchId(0, idx),
    home: participants[i] ?? "TBD",
    away: participants[j] ?? "TBD",
  }));

  const rounds: BracketRound[] = [{ id: newRoundId(0), label: "Round 1", matches: prevMatches }];

  let roundIndex = 1;
  while (prevMatches.length > 1) {
    const next: BracketMatch[] = [];
    for (let i = 0; i < prevMatches.length; i += 2) {
      next.push({
        id: newMatchId(roundIndex, i / 2),
        home: "TBD",
        away: "TBD",
      });
    }
    const label =
      next.length === 1 ? "Final" : next.length === 2 ? "Semifinals" : `Round ${roundIndex + 1}`;
    rounds.push({ id: newRoundId(roundIndex), label, matches: next });
    prevMatches = next;
    roundIndex += 1;
  }

  return rounds;
}

/** For UI copy: number of bye slots added for this team count. */
export function countByesForTeamList(teams: string[]): number {
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length < 1) return 0;
  const N = nextPowerOfTwoAtLeast(t.length);
  if (N > MAX_AUTO_BRACKET || !SINGLE_ELIM_FIRST_ROUND_PAIRINGS[N]) return 0;
  return N - t.length;
}
