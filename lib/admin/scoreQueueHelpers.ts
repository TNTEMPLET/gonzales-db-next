import { leagueCalendarDate } from "@/lib/seasonConfig";
import type { UnifiedScoreGame } from "@/lib/admin/unifiedScoreSources";

export type ScoreQueueFilters = {
  parkName: string;
  ageGroup: string;
  dateKey: string;
  showScored: boolean;
};

export function scoreGameDateKey(game: Pick<UnifiedScoreGame, "gameDate">): string {
  return game.gameDate?.trim().slice(0, 10) ?? "";
}

export function defaultScoreQueueFilters(
  games: UnifiedScoreGame[],
  asOf: Date = new Date(),
): ScoreQueueFilters {
  return {
    parkName: "ALL",
    ageGroup: "ALL",
    dateKey: defaultScoreQueueDateKey(games, asOf),
    showScored: false,
  };
}

export function defaultScoreQueueDateKey(
  games: UnifiedScoreGame[],
  asOf: Date = new Date(),
): string {
  const missingDates = uniqueDateKeys(
    games.filter((game) => !game.scored && scoreGameDateKey(game)),
  ).sort((a, b) => b.localeCompare(a));
  if (missingDates[0]) return missingDates[0];

  const allDates = uniqueDateKeys(games).sort((a, b) => b.localeCompare(a));
  if (allDates[0]) return allDates[0];

  return leagueCalendarDate(asOf);
}

export function filterScoreQueueGames(
  games: UnifiedScoreGame[],
  filters: ScoreQueueFilters,
): UnifiedScoreGame[] {
  return games.filter((game) => {
    if (!filters.showScored && game.scored) return false;
    if (filters.parkName !== "ALL" && (game.venue || "") !== filters.parkName) {
      return false;
    }
    if (filters.ageGroup !== "ALL" && game.ageGroup !== filters.ageGroup) {
      return false;
    }
    if (filters.dateKey !== "ALL" && scoreGameDateKey(game) !== filters.dateKey) {
      return false;
    }
    return true;
  });
}

export function nextUnscoredGame(
  games: UnifiedScoreGame[],
  currentId: string,
): UnifiedScoreGame | null {
  const index = games.findIndex((game) => game.id === currentId);
  if (index < 0) return games.find((game) => !game.scored) ?? null;
  return games.slice(index + 1).find((game) => !game.scored) ?? null;
}

export function filledUnscoredDrafts(
  games: UnifiedScoreGame[],
  drafts: Record<string, { homeScore: string; awayScore: string }>,
): UnifiedScoreGame[] {
  return games.filter((game) => {
    const draft = drafts[game.id];
    if (!draft?.homeScore || !draft.awayScore) return false;
    if (game.scored && String(game.homeScore) === draft.homeScore && String(game.awayScore) === draft.awayScore) {
      return false;
    }
    return true;
  });
}

function uniqueDateKeys(games: UnifiedScoreGame[]): string[] {
  return Array.from(
    new Set(games.map((game) => scoreGameDateKey(game)).filter(Boolean)),
  );
}
