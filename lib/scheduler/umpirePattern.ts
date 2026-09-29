/**
 * Assignr crew Pattern for a scheduler division.
 * 4U–5U: 0 umpires; 6U–8U and 17U: 2; 9U–10U: 1 Umpire;
 * 12U and 13-14/15U each have their own single-umpire code. Unknown → blank.
 */
export function assignrUmpirePattern(division: string): string {
  const upper = division.trim().toUpperCase();
  if (/\b13\s*[-–]\s*14\b/.test(upper) || /\b13\s*[-–]\s*15\b/.test(upper)) {
    return "1 Umpire 13-14";
  }
  const match = upper.match(/\b(\d{1,2})\s*U\b/);
  if (!match?.[1]) return "";
  const age = Number.parseInt(match[1], 10);
  if (age === 4 || age === 5) return "0 Umpires";
  if (age >= 6 && age <= 8) return "2 Umpires";
  if (age === 12) return "1 Umpire 12U";
  if (age >= 13 && age <= 15) return "1 Umpire 13-14";
  if (age === 17) return "2 Umpires";
  if (age >= 9 && age <= 11) return "1 Umpire";
  return "";
}
