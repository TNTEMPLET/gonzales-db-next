import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

export type DoubleElimBracketFormat = Extract<
  BracketSpec["bracketFormat"],
  "double_elimination" | "modified_double_elimination"
>;

export function isDoubleEliminationFormat(
  format: BracketSpec["bracketFormat"],
): format is DoubleElimBracketFormat {
  return format === "double_elimination" || format === "modified_double_elimination";
}

/** Standard double elim schedules an if-necessary reset game; modified is winner-take-all in the grand final. */
export function includesIfNecessaryChampionshipGame(format: BracketSpec["bracketFormat"]): boolean {
  return format === "double_elimination";
}

export function bracketFormatDisplayName(format: BracketSpec["bracketFormat"]): string {
  switch (format) {
    case "single_elimination":
      return "Single elimination";
    case "double_elimination":
      return "Double elimination";
    case "modified_double_elimination":
      return "Modified double elimination";
    case "pool_play":
      return "Pool play";
    case "custom":
      return "Custom";
    default:
      return "Unknown";
  }
}
