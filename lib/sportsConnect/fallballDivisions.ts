/**
 * Fall Ball's 10 standardized division codes and the free-text matcher that
 * resolves messy real-world input (SportsConnect division names, coach
 * interest form text, shorthand roster imports) to them. Pure logic, no
 * server-only / prisma / xlsx dependency — safe to import from client
 * components (lib/admin/teamsImportHelpers.ts) as well as server routes.
 * lib/sportsConnect/fallballCapacity.ts re-exports everything here for
 * existing importers and adds the prisma/xlsx-dependent capacity report on
 * top.
 */

export const STANDARD_DIVISIONS = [
  "4U TB",
  "5U TB",
  "6U MOD",
  "7U CP",
  "8U CP",
  "9U",
  "10U",
  "12U",
  "15U",
  "17U",
] as const;

/**
 * Normalizes a division-name string for matching against STANDARD_DIVISIONS —
 * case/punctuation/whitespace insensitive, and treats "9U"/"9yo"/"9 year old"
 * as equivalent. Unlike substring/`includes()` matching, this only matches
 * when the *whole* normalized string agrees, so "Tee Ball 5" can't collapse
 * into the "Tee Ball 3-4" bucket the way a `.includes("Tee Ball")` catch-all
 * would. This is the precise, high-confidence tier — real free text (coach
 * interest forms, shorthand roster imports) usually doesn't survive it, which
 * is what matchStandardDivisions()'s looser tiers below are for.
 */
function normalizeDivisionKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\byears?\s*olds?\b/g, "")
    .replace(/\byo\b/g, "")
    .replace(/(\d)\s*u\b/g, "$1")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Real SportsConnect division strings, pinned to their standardized code.
 * Without this, a range like "15-17 year-olds" would fall through to the
 * age-extraction tier below and hit the genuine age-15 ambiguity (15U vs.
 * 17U both claim age 15) — this exact string isn't ambiguous, it names 17U
 * outright, so it's resolved here at the same confidence as an exact match
 * rather than left to the age-number tier to (wrongly) guess.
 */
const KNOWN_RAW_DIVISION_ALIASES: Record<string, string> = {
  "Tee Ball, 3-4 year-olds": "4U TB",
  "Tee Ball, 5 year-olds": "5U TB",
  "Modified Tee Ball, 6 year-olds": "6U MOD",
  "Coaches' Pitch 7 year-olds": "7U CP",
  "Coaches' Pitch 8 year-olds": "8U CP",
  "9 year-old": "9U",
  "10 year-old": "10U",
  "11-12 year-olds": "12U",
  "13-15 year-olds": "15U",
  "15-17 year-olds": "17U",
};

const DIVISION_KEY_LOOKUP: Map<string, string> = new Map([
  ...STANDARD_DIVISIONS.map((name): [string, string] => [normalizeDivisionKey(name), name]),
  ...Object.entries(KNOWN_RAW_DIVISION_ALIASES).map(
    ([raw, code]): [string, string] => [normalizeDivisionKey(raw), code],
  ),
]);

function matchStandardDivisionExact(raw: string): string | null {
  return DIVISION_KEY_LOOKUP.get(normalizeDivisionKey(raw)) ?? null;
}

/**
 * Age (in whole years) -> owning standard division(s). 15 is the one
 * genuinely ambiguous age — "15U" (the old "13-15 year-olds" range) and
 * "17U" (the old "15-17 year-olds" range) both claim it — so a bare,
 * un-ranged "15" resolves to both. Any range that actually spells out either
 * boundary (e.g. "13-15", "15-17", or an already-standardized code) is
 * caught by the exact-match tier above before this table is ever consulted,
 * so the ambiguity only surfaces for genuinely bare input.
 */
const AGE_TO_DIVISION: Record<number, readonly string[]> = {
  3: ["4U TB"],
  4: ["4U TB"],
  5: ["5U TB"],
  6: ["6U MOD"],
  7: ["7U CP"],
  8: ["8U CP"],
  9: ["9U"],
  10: ["10U"],
  11: ["12U"],
  12: ["12U"],
  13: ["15U"],
  14: ["15U"],
  15: ["15U", "17U"],
  16: ["17U"],
  17: ["17U"],
};

/**
 * Pulls every plausible age (3-17) out of free text, regardless of how it's
 * written — "7U", "10u", "15yo", "3/4", "11-12" all reduce to bare digit
 * tokens once suffixes and non-digit separators are stripped. A bare
 * multi-digit run outside 3-17 (e.g. a "2026" season year that leaked into
 * the field) never matches because it isn't a 1-2 digit token to begin with.
 */
function extractAgeNumbers(raw: string): number[] {
  const withoutAgeSuffixes = raw
    .toLowerCase()
    // "7u", "10u", "15yo" -> "7 ", "10 ", "15 " (keep the digits, drop the suffix)
    .replace(/(\d{1,2})\s*(?:u|yo)(?![a-z0-9])/g, "$1 ")
    // Any remaining letters ("dyb", "tee", "ball", "year", "olds", ...) are noise.
    .replace(/[a-z]+/g, " ");

  const ages = (withoutAgeSuffixes.match(/\d{1,2}/g) ?? [])
    .map(Number)
    .filter((n) => n >= 3 && n <= 17);

  return Array.from(new Set(ages));
}

type KeywordFallbackRule = { test: RegExp; divisions: readonly string[] };

/**
 * Last-resort tier for text with no extractable age number at all — checked
 * in order so "modified tee ball" (unambiguous) is claimed before the
 * generic "tee ball" rule (ambiguous between the 4U and 5U divisions) ever
 * gets a chance to also match the same text.
 */
const KEYWORD_FALLBACK_RULES: readonly KeywordFallbackRule[] = [
  { test: /modified/, divisions: ["6U MOD"] },
  { test: /coach(?:es)?\s*'?\s*pitch/, divisions: ["7U CP", "8U CP"] },
  { test: /tee\s*ball/, divisions: ["4U TB", "5U TB"] },
];

/**
 * Flexible division matcher — resolves shorthand, multi-division, and
 * suffix-noisy free text (e.g. "7U", "6u", "3/4 tee ball", "11/12",
 * "10u DYB", "7U/8U") to every standard division it plausibly names, not
 * just one. Three tiers, most confident first:
 *  1. Exact match after normalization (also how an already-standardized
 *     code like "6U MOD" matches itself, idempotently).
 *  2. Every 3-17 age number found in the text, mapped to its division(s).
 *  3. Unambiguous keyword fallback, only when tier 2 found nothing.
 * Returns [] when nothing matches at any tier — callers should never treat
 * that as "division 0", only as "no signal".
 */
export function matchStandardDivisions(raw: string): string[] {
  if (!raw || !raw.trim()) return [];

  const exact = matchStandardDivisionExact(raw);
  if (exact) return [exact];

  const matchedFromAges = new Set<string>();
  for (const age of extractAgeNumbers(raw)) {
    for (const division of AGE_TO_DIVISION[age] ?? []) {
      matchedFromAges.add(division);
    }
  }
  if (matchedFromAges.size > 0) {
    return STANDARD_DIVISIONS.filter((division) => matchedFromAges.has(division));
  }

  const lowered = raw.toLowerCase();
  for (const rule of KEYWORD_FALLBACK_RULES) {
    if (rule.test.test(lowered)) return [...rule.divisions];
  }

  return [];
}

/** Single-division convenience wrapper — for callers where a value can only ever belong to one division (a player's own division, a team's ageGroup), not free text that may legitimately name several. */
export function matchStandardDivision(raw: string): string | null {
  return matchStandardDivisions(raw)[0] ?? null;
}
