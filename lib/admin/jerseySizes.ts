/**
 * Canonical jersey size rank, smallest to largest. Keys are the normalized
 * form (see normalizeJerseySize); each entry's array position is its rank.
 * Multiple raw spellings can map to the same rank ("youth sm" and
 * "youth s/m" are the same size) — this is an alias table, not a strict
 * list of accepted strings, because real SportsConnect exports abbreviate
 * inconsistently (seen live: "Adult Med", "Adult Sm", not "Adult M"/"Adult S").
 *
 * Youth sizing here is XS < S/M combo < M < L < XL — confirmed against a
 * real fallball export where "Youth SM" outnumbers separate S entirely
 * (there is no separate "Youth S"), i.e. leagues sell S/M as one combined
 * youth size, not two.
 */
const SIZE_RANK_GROUPS: string[][] = [
  ["youth xxs"],
  ["youth xs"],
  ["youth sm", "youth s/m", "youth s m"],
  ["youth s"],
  ["youth m", "youth med", "youth medium"],
  ["youth ml", "youth m/l", "youth m l"],
  ["youth l", "youth large"],
  ["youth xl"],
  ["adult xs"],
  ["adult s", "adult sm", "adult small"],
  ["adult m", "adult med", "adult medium"],
  ["adult ml", "adult m/l", "adult m l"],
  ["adult l", "adult large"],
  ["adult xl"],
  ["adult xxl", "adult 2xl"],
  ["adult xxxl", "adult 3xl"],
  ["adult xxxxl", "adult 4xl"],
];

const SIZE_RANK_BY_ALIAS = new Map<string, number>();
SIZE_RANK_GROUPS.forEach((aliases, rank) => {
  for (const alias of aliases) SIZE_RANK_BY_ALIAS.set(alias, rank);
});

export function normalizeJerseySize(raw: string | null | undefined): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * A cell can hold more than one size ("Youth SM, Youth M" — someone
 * selected two options on the registration form). Only the first is used
 * for sorting; `sortPlayersBySize` flags these to the admin rather than
 * silently picking one, since it's a data-entry ambiguity, not a typo.
 */
function firstSizeToken(raw: string): string {
  return raw.split(",")[0]?.trim() ?? raw;
}

export function jerseySizeRank(raw: string | null | undefined): number {
  const normalized = normalizeJerseySize(raw);
  if (!normalized) return SIZE_RANK_GROUPS.length + 1;
  const rank = SIZE_RANK_BY_ALIAS.get(firstSizeToken(normalized));
  return rank ?? SIZE_RANK_GROUPS.length;
}

/**
 * Sorts players by jersey size (smallest first), tie-broken by last name.
 * Returns the fullName of any player whose size didn't match a known alias,
 * or whose size cell held more than one value (blank sizes are treated as
 * "unknown," not flagged) so the caller can warn before numbers go out
 * based on a guess.
 */
export function sortPlayersBySize<
  T extends { jerseySize: string | null; lastName?: string | null; fullName: string },
>(players: T[]): { sorted: T[]; unmatched: string[] } {
  const unmatched: string[] = [];
  for (const p of players) {
    const normalized = normalizeJerseySize(p.jerseySize);
    if (!normalized) continue;
    const hasMultipleValues = normalized.includes(",");
    const isKnown = SIZE_RANK_BY_ALIAS.has(firstSizeToken(normalized));
    if (!isKnown || hasMultipleValues) unmatched.push(p.fullName);
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
