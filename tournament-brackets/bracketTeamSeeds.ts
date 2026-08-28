/** Ordered team list: index 0 is seed 1 (best seed). */
export function teamNamesInSeedOrder(entries: { teamName: string; seed: number }[]): string[] {
  return [...entries]
    .sort(
      (a, b) =>
        a.seed - b.seed ||
        a.teamName.localeCompare(b.teamName, "en-US", { numeric: true, sensitivity: "base" }),
    )
    .map((e) => e.teamName.trim())
    .filter(Boolean);
}

export function teamNamesToSeedEntries(teamNames: string[]): { teamName: string; seed: number }[] {
  return teamNames
    .map((teamName) => teamName.trim())
    .filter(Boolean)
    .map((teamName, index) => ({ teamName, seed: index + 1 }));
}

/** Move `teamName` to 1-based `newSeed` within the current seeded list. */
export function reorderTeamToSeed(teamNames: string[], teamName: string, newSeed: number): string[] {
  const name = teamName.trim();
  if (!name) return teamNames;

  const current = teamNames.map((n) => n.trim()).filter(Boolean);
  const without = current.filter((n) => n !== name);
  if (!current.includes(name)) return current;

  const n = without.length + 1;
  if (n === 0) return [];

  const target = Math.max(1, Math.min(n, Math.round(newSeed)));
  const next = [...without];
  next.splice(target - 1, 0, name);
  return next;
}

export function clampSeedNumber(value: number, teamCount: number): number {
  if (teamCount < 1) return 1;
  return Math.max(1, Math.min(teamCount, Math.round(value)));
}
