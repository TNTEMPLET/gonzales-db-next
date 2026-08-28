import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

export type DoubleElimBracketFormat = Extract<
  BracketSpec["bracketFormat"],
  "double_elimination" | "modified_double_elimination"
>;

export type ChampionshipSeriesStyle = NonNullable<BracketSpec["championshipSeriesStyle"]>;

export function isDoubleEliminationFormat(
  format: BracketSpec["bracketFormat"],
): format is DoubleElimBracketFormat {
  return format === "double_elimination" || format === "modified_double_elimination";
}

/** Resolve championship series style from spec, with legacy fallback from bracket format. */
export function resolveChampionshipSeriesStyle(
  spec: Pick<BracketSpec, "bracketFormat" | "championshipSeriesStyle">,
): ChampionshipSeriesStyle | null {
  if (spec.championshipSeriesStyle) return spec.championshipSeriesStyle;
  if (!isDoubleEliminationFormat(spec.bracketFormat)) return null;
  return spec.bracketFormat === "double_elimination" ? "always_scheduled_reset" : "winner_take_all";
}

export function bracketFormatForChampionshipSeriesStyle(
  style: ChampionshipSeriesStyle,
): DoubleElimBracketFormat {
  return style === "always_scheduled_reset" ? "double_elimination" : "modified_double_elimination";
}

/** Standard double elim schedules an if-necessary reset game; modified is winner-take-all in the grand final. */
export function includesIfNecessaryChampionshipGame(
  spec: Pick<BracketSpec, "bracketFormat" | "championshipSeriesStyle">,
): boolean {
  const style = resolveChampionshipSeriesStyle(spec);
  if (style) return style === "always_scheduled_reset";
  return spec.bracketFormat === "double_elimination";
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
