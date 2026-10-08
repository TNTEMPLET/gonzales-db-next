import { isPastKickoff, isScoreEntryPark } from "@/lib/schedule/scoreableGames";

export function gamesReadyForScores<T extends { dateKey: string; startTime: string; parkName: string }>(
  games: readonly T[],
  asOf: Date = new Date(),
): { ready: T[]; closedForPark: boolean } {
  const past = games.filter((game) => isPastKickoff(game.dateKey, game.startTime, asOf));
  const ready = past.filter((game) => isScoreEntryPark(game.parkName));
  return { ready, closedForPark: past.length > 0 && ready.length === 0 };
}
