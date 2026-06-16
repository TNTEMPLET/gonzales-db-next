import type { BracketRound } from "@/lib/tournament-brackets/bracketSpec";
import {
  bracketFormatForChampionshipSeriesStyle,
  type ChampionshipSeriesStyle,
} from "@/lib/tournament-brackets/bracketFormat";
import { nextPowerOfTwoAtLeast } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

export type OfficialTemplateShellPlacement = "standard_seed" | "little_league_pdf";

/** Smallest power-of-two bracket shell that fits `teamCount` teams (e.g. 6→8, 10→16). */
export function officialTemplateShellSize(teamCount: number): number {
  return nextPowerOfTwoAtLeast(teamCount);
}

export function officialTemplateByeCount(teamCount: number): number {
  return officialTemplateShellSize(teamCount) - teamCount;
}

export function championshipStyleToFormat(style: ChampionshipSeriesStyle) {
  return bracketFormatForChampionshipSeriesStyle(style);
}
