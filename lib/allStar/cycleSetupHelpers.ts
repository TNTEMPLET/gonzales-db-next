export type ContentOrgId = "gonzales" | "ascension";

export type AllStarAgeOption = {
  id: string;
  label: string;
};

export function formatOrganizationLabel(org: ContentOrgId) {
  return org === "gonzales" ? "Gonzales DYB" : "Ascension LLB";
}

export function parsePrimaryAgeFromAgeGroup(ageGroup: string) {
  const match = ageGroup.trim().toUpperCase().match(/^(\d{1,2})U\b/);
  if (!match?.[1]) return null;
  const age = Number.parseInt(match[1], 10);
  if (!Number.isFinite(age) || age < 4 || age > 18) return null;
  return age;
}

export function buildAllStarAgeOptionsForAgeGroup(ageGroup: string): AllStarAgeOption[] {
  const primaryAge = parsePrimaryAgeFromAgeGroup(ageGroup);
  if (!primaryAge) return [];
  const secondaryAge = primaryAge - 1;
  const options: AllStarAgeOption[] = [];
  if (secondaryAge >= 4) {
    options.push({ id: `${secondaryAge}U`, label: `${secondaryAge}U` });
  }
  options.push({ id: `${primaryAge}U`, label: `${primaryAge}U` });
  return options;
}

export function requiresDyb12uAgeBandFilter(orgId: ContentOrgId, ageGroup: string) {
  return orgId === "gonzales" && ageGroup.trim().toUpperCase().startsWith("12U");
}

export function buildSeasonYearOptions(anchorYear: number, extraYears: number[] = []) {
  return Array.from(new Set([anchorYear - 1, anchorYear, anchorYear + 1, anchorYear + 2, ...extraYears])).sort(
    (a, b) => b - a,
  );
}

export function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Request failed (${response.status}): response was not valid JSON.`);
  }
}
