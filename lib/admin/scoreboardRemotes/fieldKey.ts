import { normalizeVenueName } from "@/lib/venues/match";

/** Same key as a shared park name: case, spacing, and punctuation collapse. */
export function normalizeScoreboardFieldName(value: string | null | undefined): string {
  return normalizeVenueName(value);
}

/**
 * Hold key for "this field still has a remote out".
 * Venue plus the normalized field name, so Gonzales "Field #3" and Fall Ball
 * "Field 3" at the same park share one hold. A missing venue cannot be shared.
 */
export function scoreboardFieldHoldKey(
  venueId: string | null | undefined,
  fieldName: string | null | undefined,
): string | null {
  if (!venueId) return null;
  return `${venueId}:${normalizeScoreboardFieldName(fieldName)}`;
}
