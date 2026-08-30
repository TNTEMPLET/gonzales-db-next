/**
 * Canonical youth-then-adult jersey size ordering, smallest to largest.
 * Sizes are matched case/whitespace-insensitively; anything not on this list
 * sorts after every recognized size (alphabetically among themselves) rather
 * than throwing, since a roster with a stray/typo'd size value should still
 * get numbered — see `sortPlayersBySize`'s `unmatched` return for surfacing
 * those to an admin instead of silently guessing.
 */
export const JERSEY_SIZE_ORDER = [
  "youth xxs",
  "youth xs",
  "youth s",
  "youth sm",
  "youth m",
  "youth ml",
  "youth l",
  "youth xl",
  "adult xs",
  "adult s",
  "adult sm",
  "adult m",
  "adult ml",
  "adult l",
  "adult xl",
  "adult xxl",
  "adult 2xl",
  "adult xxxl",
  "adult 3xl",
  "adult xxxxl",
  "adult 4xl",
];

export function normalizeJerseySize(raw: string | null | undefined): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function jerseySizeRank(raw: string | null | undefined): number {
  const normalized = normalizeJerseySize(raw);
  if (!normalized) return JERSEY_SIZE_ORDER.length + 1;
  const index = JERSEY_SIZE_ORDER.indexOf(normalized);
  return index >= 0 ? index : JERSEY_SIZE_ORDER.length;
}

/**
 * Sorts players by jersey size (smallest first), tie-broken by last name.
 * Returns the fullName of any player whose size didn't match a known entry
 * (blank sizes are treated as "unknown," not flagged) so the caller can warn
 * before numbers go out based on a guess.
 */
export function sortPlayersBySize<
  T extends { jerseySize: string | null; lastName?: string | null; fullName: string },
>(players: T[]): { sorted: T[]; unmatched: string[] } {
  const unmatched: string[] = [];
  for (const p of players) {
    const normalized = normalizeJerseySize(p.jerseySize);
    if (normalized && !JERSEY_SIZE_ORDER.includes(normalized)) {
      unmatched.push(p.fullName);
    }
  }
  const sorted = [...players].sort((a, b) => {
    const rankDiff = jerseySizeRank(a.jerseySize) - jerseySizeRank(b.jerseySize);
    if (rankDiff !== 0) return rankDiff;
    const lastA = (a.lastName || a.fullName).toLowerCase();
    const lastB = (b.lastName || b.fullName).toLowerCase();
    return lastA.localeCompare(lastB);
  });
  return { sorted, unmatched };
}
