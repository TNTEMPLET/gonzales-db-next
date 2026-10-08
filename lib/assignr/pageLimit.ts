/** Assignr rejects `limit` above 50 (`422`, path `/limit`). */
export const ASSIGNR_MAX_PAGE_LIMIT = 50;

/**
 * Page size sent to Assignr. Missing or invalid sizes use 50.
 * A larger request is capped so the existing page loop can keep going.
 */
export function assignrPageLimit(requested?: number): number {
  if (requested == null || !Number.isFinite(requested) || requested < 1) {
    return ASSIGNR_MAX_PAGE_LIMIT;
  }
  return Math.min(Math.floor(requested), ASSIGNR_MAX_PAGE_LIMIT);
}
