import { normalizeAgeGroup } from "@/lib/ageGroupAliases";
import { inferContentOrgFromAgeGroup } from "@/lib/admin/assignrOrgScope";
import type { ContentOrgId } from "@/lib/siteConfig";

const TOURNAMENT_AGE_GROUP_ALIASES: Record<string, string> = {
  "9 year old diamond city tournament": "9U DYB",
  "10 year old diamond city tournament": "10U DYB",
  "11/12 year old diamond citytournament": "12U DYB",
  "6 year old coaches pitch parish tournament": "6U CP",
  "7 year old coaches pitch parish tournament": "7U CP",
  "8 year old coaches pitch parish tournament": "8U CP",
  "13-14 year old dbb parish tournament": "14U DBB",
  "15-17 year old dixie pre majors parish tournament": "16U DBB",
};

function normalizeTournamentKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractAgeGroupFromTitle(title: string) {
  const normalized = normalizeTournamentKey(title);
  const alias = TOURNAMENT_AGE_GROUP_ALIASES[normalized];
  if (alias) return alias;

  const rangeMatch = normalized.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return `${rangeMatch[2]}U`;
  }

  const yearOldMatch = normalized.match(/(\d{1,2})\s*year\s*old/);
  if (yearOldMatch) {
    return `${yearOldMatch[1]}U`;
  }

  const slashMatch = normalized.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (slashMatch) {
    return `${slashMatch[2]}U`;
  }

  return null;
}

export function suggestTournamentContentOrg(
  sourceTournament: string,
): ContentOrgId | null {
  const normalized = normalizeTournamentKey(sourceTournament);
  if (
    normalized.includes("little league") ||
    normalized.includes("llb") ||
    normalized.includes("dixie pre majors")
  ) {
    return "ascension";
  }
  if (
    normalized.includes("diamond city") ||
    normalized.includes("dyb") ||
    normalized.includes("dbb") ||
    normalized.includes("coaches pitch")
  ) {
    return "gonzales";
  }
  return null;
}

export function suggestAgeGroupForTournament(
  sourceTournament: string,
  scheduleAgeGroups: string[],
  preferredOrg?: ContentOrgId | null,
) {
  const trimmed = sourceTournament.trim();
  if (!trimmed) return null;

  const scopedAgeGroups = preferredOrg
    ? scheduleAgeGroups.filter((option) => {
        const org = inferContentOrgFromAgeGroup(option);
        return !org || org === preferredOrg;
      })
    : scheduleAgeGroups;

  const alias = TOURNAMENT_AGE_GROUP_ALIASES[normalizeTournamentKey(trimmed)];
  if (alias) {
    const exact = scopedAgeGroups.find(
      (option) => option.trim().toLowerCase() === alias.toLowerCase(),
    );
    if (exact) return exact;
  }

  const normalized = normalizeAgeGroup(trimmed);
  if (normalized) {
    const exact = scopedAgeGroups.find(
      (option) => option.trim().toLowerCase() === normalized.toLowerCase(),
    );
    if (exact) return exact;
  }

  const extracted = extractAgeGroupFromTitle(trimmed);
  if (extracted) {
    const exact = scopedAgeGroups.find(
      (option) => option.trim().toLowerCase() === extracted.toLowerCase(),
    );
    if (exact) return exact;

    const fuzzy = scopedAgeGroups.find((option) => {
      const optionNorm = option.trim().toUpperCase();
      return optionNorm.startsWith(extracted.toUpperCase());
    });
    if (fuzzy) return fuzzy;
  }

  const loose = scopedAgeGroups.find((option) => {
    const optionNorm = option.trim().toLowerCase();
    const titleNorm = trimmed.toLowerCase();
    return titleNorm.includes(optionNorm) || optionNorm.includes(titleNorm);
  });
  return loose ?? null;
}

export function suggestParkVenue(
  sourcePark: string,
  venues: string[],
) {
  const normalizedPark = sourcePark.trim().toLowerCase();
  if (!normalizedPark) return null;

  const exact = venues.find(
    (venue) => venue.trim().toLowerCase() === normalizedPark,
  );
  if (exact) return exact;

  const fuzzy = venues.find((venue) => {
    const venueNorm = venue.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const parkNorm = normalizedPark.replace(/[^a-z0-9]/g, "");
    return venueNorm.includes(parkNorm) || parkNorm.includes(venueNorm);
  });
  return fuzzy ?? null;
}
