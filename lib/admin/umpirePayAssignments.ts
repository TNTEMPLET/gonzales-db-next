/** True when any game that day has two (or more) umpires. */
export function dayUsesTwoAssignmentColumns(
  games: { umpires: readonly unknown[] }[],
): boolean {
  return games.some((game) => game.umpires.length >= 2);
}

export function formatAssignmentLabel(
  ump: { name: string; pay: number },
  money: (pay: number) => string,
): string {
  return `${ump.name} — ${money(ump.pay)}`;
}

/**
 * Assignment 1 / Assignment 2 cell text.
 * One umpire or none leaves the second cell empty so the row still has two columns.
 */
export function assignmentColumnPair(
  umpires: { name: string; pay: number }[],
  money: (pay: number) => string,
  options?: { cancelled?: boolean; noneLabel?: string },
): [string, string] {
  if (options?.cancelled) return ["Cancelled — $0", ""];
  if (umpires.length === 0) return [options?.noneLabel ?? "No assignment", ""];
  const first = formatAssignmentLabel(umpires[0]!, money);
  if (umpires.length === 1) return [first, ""];
  return [first, formatAssignmentLabel(umpires[1]!, money)];
}
