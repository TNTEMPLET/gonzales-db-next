/**
 * Assignr crew Pattern for a scheduler division.
 * 4U–5U: 0 umpires; 6U–8U and 17U: 2; 9U–15U: 1. Unknown → blank.
 */
export function assignrUmpirePattern(division: string): string {
  const match = division.trim().toUpperCase().match(/\b(\d{1,2})\s*U\b/);
  if (!match?.[1]) return "";
  const age = Number.parseInt(match[1], 10);
  if (age === 4 || age === 5) return "0 Umpires";
  if (age >= 6 && age <= 8) return "2 Umpires";
  if (age === 17) return "2 Umpires";
  if (age >= 9 && age <= 15) return "1 Umpire";
  return "";
}
