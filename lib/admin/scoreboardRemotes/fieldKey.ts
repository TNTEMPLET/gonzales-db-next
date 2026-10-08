import { normalizeVenueName } from "@/lib/venues/match";

/** Same key as a shared park name: case, spacing, and punctuation collapse. */
export function normalizeScoreboardFieldName(value: string | null | undefined): string {
  return normalizeVenueName(value);
}

/**
 * Hold key for "this field still has a remote out".
 * Venue plus the normalized field name, so Gonzales "Field #3" and Fall Ball
 * "Field 3" at the same park share one hold.
 */
export function scoreboardFieldHoldKey(
  venueId: string | null | undefined,
  fieldName: string | null | undefined,
): string | null {
  if (!venueId) return null;
  return `${venueId}:${normalizeScoreboardFieldName(fieldName)}`;
}

/**
 * Legacy column holds have no venue when the park is not linked.
 * Those still match on the park name plus the normalized field name.
 * Inventory holds stay on {@link scoreboardFieldHoldKey}.
 */
export function legacyRemoteHoldKey(
  venueId: string | null | undefined,
  parkName: string | null | undefined,
  fieldName: string | null | undefined,
): string | null {
  const venueKey = scoreboardFieldHoldKey(venueId, fieldName);
  if (venueKey) return venueKey;
  const park = normalizeScoreboardFieldName(parkName);
  const field = normalizeScoreboardFieldName(fieldName);
  if (!park || !field) return null;
  return `park:${park}:${field}`;
}
