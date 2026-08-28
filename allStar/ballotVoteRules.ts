export const DEFAULT_REQUIRED_RATINGS_PER_COACH = 12;
export const MIN_REQUIRED_RATINGS_PER_COACH = 1;
export const MAX_REQUIRED_RATINGS_PER_COACH = 50;

export function parseRequiredRatingsPerCoachInput(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < MIN_REQUIRED_RATINGS_PER_COACH || parsed > MAX_REQUIRED_RATINGS_PER_COACH) {
    return null;
  }
  return parsed;
}

export function normalizeRequiredRatingsPerCoach(
  value: unknown,
  fallback = DEFAULT_REQUIRED_RATINGS_PER_COACH,
): number {
  return parseRequiredRatingsPerCoachInput(value) ?? fallback;
}

export function countValidRatings(ratings: Record<string, number>) {
  return Object.values(ratings).filter((rating) => rating >= 1 && rating <= 5).length;
}
