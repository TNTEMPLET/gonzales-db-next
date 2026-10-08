/** Dark text on pale league colors (Fall Ball accent is not used as a fill). */
export function badgeTextColor(hex: string): "#111827" | "#ffffff" {
  const raw = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return "#111827";
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export type GameDayCardLine = {
  when: string;
  division: string;
  parkName: string;
  fieldName: string;
  awayTeam: string;
  homeTeam: string;
  crew: readonly string[];
};

export function umpireCardText(games: readonly GameDayCardLine[]): string {
  return games
    .map((game, index) => {
      const crew = game.crew.length > 0 ? game.crew.join(", ") : "Crew not listed";
      const field = game.fieldName ? `${game.parkName} · ${game.fieldName}` : game.parkName;
      return [
        `${index + 1}. ${game.when}`,
        game.division,
        field,
        `${game.awayTeam} at ${game.homeTeam}`,
        crew,
      ].join("\n");
    })
    .join("\n\n");
}
