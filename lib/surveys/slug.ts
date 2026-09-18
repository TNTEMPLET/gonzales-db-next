const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSurveySlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** Lowercase kebab-case, letters/numbers/hyphens only. Empty if nothing usable remains. */
export function slugifySurveyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return isValidSurveySlug(slug) ? slug : "";
}

export function parentSurveySlug(seasonYear: number, season: "SPRING" | "FALL"): string {
  return `${seasonYear}-${season.toLowerCase()}-parent-survey`;
}

export function parentSurveyTitle(seasonYear: number, season: "SPRING" | "FALL"): string {
  return `${seasonYear} ${season === "FALL" ? "Fall" : "Spring"} Parent Survey`;
}
