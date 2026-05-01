/**
 * Maps common human-readable age group labels (as they appear in CSV exports,
 * registration systems, etc.) to the canonical strings used by Assignr.
 *
 * Keys must be lowercase for case-insensitive matching.
 * Add new entries here whenever a new label format shows up in an import.
 */
export const AGE_GROUP_ALIASES: Record<string, string> = {
  // Little League Baseball (LLB) — Gonzales / Ascension
  "little league 8-10 year-old minor": "10U LLB",
  "little league 9-10 year-old minor": "10U LLB",
  "little league minor": "10U LLB",
  "little league 11-12 year-old major": "12U LLB",
  "little league major": "12U LLB",
  "little league junior 13-14": "14U LLB",
  "little league junior": "14U LLB",
  "little league senior 15-16": "16U LLB",
  "little league senior": "16U LLB",

  // Diamond Youth Baseball (DYB) — short-hand aliases
  "9u dyb": "9U DYB",
  "10u dyb": "10U DYB",
  "11u dyb": "11U DYB",
  "12u dyb": "12U DYB",
  "13u dyb": "13U DYB",
  "14u dyb": "14U DYB",

  // Numeric-only shortcuts (without org suffix — maps to DYB by default)
  "9u": "9U DYB",
  "10u": "10U DYB",
  "11u": "11U DYB",
  "12u": "12U DYB",
  "13u": "13U DYB",
  "14u": "14U DYB",
  "16u": "16U LLB",
};

/**
 * Normalizes a raw age group string from a CSV import to its canonical
 * Assignr label. If no alias matches, returns the trimmed original value.
 */
export function normalizeAgeGroup(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const key = raw.trim().toLowerCase();
  return AGE_GROUP_ALIASES[key] ?? raw.trim();
}
