export type RainoutBannerInput = {
  leagueLabel: string;
  allParksOut: boolean;
  rainedOutParks: readonly string[];
  throughLabel: string | null;
};

function withThrough(sentence: string, throughLabel: string | null): string {
  const through = throughLabel?.trim();
  if (!through) return sentence;
  return `${sentence} ${through}.`;
}

/**
 * Read-only copy. An empty park list (chooser still open) shows every active rainout.
 * A chosen park shows all-parks rainouts and rainouts that name that park.
 */
export function rainoutBannerLines(
  alerts: readonly RainoutBannerInput[],
  parkNames: readonly string[],
): string[] {
  const names = new Set(parkNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const lines: string[] = [];
  for (const alert of alerts) {
    if (alert.allParksOut) {
      lines.push(withThrough(`${alert.leagueLabel}: all parks are rained out.`, alert.throughLabel));
      continue;
    }
    const listed = alert.rainedOutParks.map((park) => park.trim()).filter(Boolean);
    const matched =
      names.size === 0 ? listed : listed.filter((park) => names.has(park.toLowerCase()));
    if (matched.length === 0) continue;
    lines.push(withThrough(`${alert.leagueLabel}: ${matched.join(", ")} rained out.`, alert.throughLabel));
  }
  return lines;
}
