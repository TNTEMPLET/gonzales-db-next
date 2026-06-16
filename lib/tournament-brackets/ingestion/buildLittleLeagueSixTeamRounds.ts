import type { BracketMatch, BracketRound } from "@/lib/tournament-brackets/bracketSpec";
import type { PdfGameScheduleLine } from "@/lib/tournament-brackets/ingestion/parsePdfGameRouting";

type GameDef = {
  gameNumber: number;
  home: string;
  away: string;
  bracketSection: "winners" | "losers" | "championship";
  roundLabel: string;
  championshipRole?: "grand_final" | "if_necessary";
};

/**
 * Official Little League 6-team double-elimination core (G1–G9) on the 8-slot power-of-2 shell.
 * Winners: G1/G2 openers, E/F byes into G3/G4 semis, G7 final. Feeders verified against District 2 DocHub PDFs.
 */
const SIX_TEAM_CORE_GAMES: GameDef[] = [
  { gameNumber: 1, home: "$0", away: "$1", bracketSection: "winners", roundLabel: "Winners Bracket — Round 1" },
  { gameNumber: 2, home: "$2", away: "$3", bracketSection: "winners", roundLabel: "Winners Bracket — Round 1" },
  { gameNumber: 3, home: "W1", away: "$4", bracketSection: "winners", roundLabel: "Winners Bracket — Round 2" },
  { gameNumber: 4, home: "W2", away: "$5", bracketSection: "winners", roundLabel: "Winners Bracket — Round 2" },
  { gameNumber: 7, home: "W3", away: "W4", bracketSection: "winners", roundLabel: "Winners Bracket — Final" },
  { gameNumber: 5, home: "L1", away: "L4", bracketSection: "losers", roundLabel: "Losers Bracket — Round 1" },
  { gameNumber: 6, home: "L2", away: "L3", bracketSection: "losers", roundLabel: "Losers Bracket — Round 1" },
  { gameNumber: 8, home: "W5", away: "W6", bracketSection: "losers", roundLabel: "Losers Bracket — Round 2" },
  { gameNumber: 9, home: "L7", away: "W8", bracketSection: "losers", roundLabel: "Losers Bracket — Round 3" },
];

const SIX_TEAM_GRAND_FINAL: GameDef = {
  gameNumber: 10,
  home: "W7",
  away: "W9",
  bracketSection: "championship",
  roundLabel: "Championship",
  championshipRole: "grand_final",
};

const SIX_TEAM_IF_NECESSARY: GameDef = {
  gameNumber: 11,
  home: "W10",
  away: "L10",
  bracketSection: "championship",
  roundLabel: "Championship",
  championshipRole: "if_necessary",
};

function resolveTeamToken(token: string, teams: string[]): string {
  const m = /^\$(\d+)$/.exec(token);
  if (m) return teams[Number(m[1])] ?? "TBD";
  return token;
}

function newMatchId(section: string, gameNumber: number): string {
  const suffix =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : String(Date.now() + gameNumber);
  return `pdf-${section}-g${gameNumber}-${suffix}`;
}

function newRoundId(section: string, idx: number): string {
  const suffix =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : String(Date.now() + idx);
  return `pdf-${section}-r${idx}-${suffix}`;
}

function applySchedule(match: BracketMatch, schedule?: PdfGameScheduleLine): BracketMatch {
  if (!schedule) return match;
  const out = { ...match };
  if (schedule.dateLabel) out.dateLabel = schedule.dateLabel;
  if (schedule.time) out.time = schedule.time;
  if (schedule.field) out.field = schedule.field;
  return out;
}

function buildRoundsFromGameDefs(
  teams: string[],
  gameDefs: GameDef[],
  scheduleByGame?: Map<number, PdfGameScheduleLine>,
): BracketRound[] {
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length !== 6) {
    throw new Error(`Six-team Little League bracket requires exactly 6 teams (got ${t.length}).`);
  }

  const roundOrder: { section: GameDef["bracketSection"]; label: string; gameNumbers: number[] }[] = [
    { section: "winners", label: "Winners Bracket — Round 1", gameNumbers: [1, 2] },
    { section: "winners", label: "Winners Bracket — Round 2", gameNumbers: [3, 4] },
    { section: "winners", label: "Winners Bracket — Final", gameNumbers: [7] },
    { section: "losers", label: "Losers Bracket — Round 1", gameNumbers: [5, 6] },
    { section: "losers", label: "Losers Bracket — Round 2", gameNumbers: [8] },
    { section: "losers", label: "Losers Bracket — Round 3", gameNumbers: [9] },
    {
      section: "championship",
      label: "Championship",
      gameNumbers: gameDefs
        .filter((g) => g.bracketSection === "championship")
        .map((g) => g.gameNumber),
    },
  ];

  const gameDefMap = new Map(gameDefs.map((g) => [g.gameNumber, g]));
  const rounds: BracketRound[] = [];
  let roundIdx = 0;

  for (const group of roundOrder) {
    const matches: BracketMatch[] = [];
    for (const gameNumber of group.gameNumbers) {
      const def = gameDefMap.get(gameNumber);
      if (!def) continue;
      const match: BracketMatch = {
        id: newMatchId(def.bracketSection, gameNumber),
        home: resolveTeamToken(def.home, t),
        away: resolveTeamToken(def.away, t),
        officialGameNumber: String(gameNumber),
      };
      if (def.championshipRole) match.championshipRole = def.championshipRole;
      matches.push(applySchedule(match, scheduleByGame?.get(gameNumber)));
    }
    if (matches.length === 0) continue;
    rounds.push({
      id: newRoundId(group.section, roundIdx++),
      label: group.label,
      bracketSection: group.section,
      matches,
    });
  }

  return rounds;
}

/** Standard 6-team DE: G10 grand final + G11 if-necessary (11 live game numbers). */
export function buildLittleLeagueSixTeamStandardDeRounds(
  teams: string[],
  scheduleByGame?: Map<number, PdfGameScheduleLine>,
): BracketRound[] {
  return buildRoundsFromGameDefs(
    teams,
    [...SIX_TEAM_CORE_GAMES, SIX_TEAM_GRAND_FINAL, SIX_TEAM_IF_NECESSARY],
    scheduleByGame,
  );
}

/** Modified 6-team DE: winner-take-all at G10, no if-necessary game (10 live game numbers). */
export function buildLittleLeagueSixTeamModifiedDeRounds(
  teams: string[],
  scheduleByGame?: Map<number, PdfGameScheduleLine>,
): BracketRound[] {
  return buildRoundsFromGameDefs(teams, [...SIX_TEAM_CORE_GAMES, SIX_TEAM_GRAND_FINAL], scheduleByGame);
}

export function countLittleLeagueSixTeamStandardDeGames(): number {
  return SIX_TEAM_CORE_GAMES.length + 2;
}

export function countLittleLeagueSixTeamModifiedDeGames(): number {
  return SIX_TEAM_CORE_GAMES.length + 1;
}
