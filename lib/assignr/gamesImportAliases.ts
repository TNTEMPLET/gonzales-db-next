import { normalizeAgeGroup } from "@/lib/ageGroupAliases";

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

export function suggestAgeGroupForTournament(
  sourceTournament: string,
  scheduleAgeGroups: string[],
) {
  const trimmed = sourceTournament.trim();
  if (!trimmed) return null;

  const alias = TOURNAMENT_AGE_GROUP_ALIASES[normalizeTournamentKey(trimmed)];
  if (alias) {
    const exact = scheduleAgeGroups.find(
      (option) => option.trim().toLowerCase() === alias.toLowerCase(),
    );
    if (exact) return exact;
  }

  const normalized = normalizeAgeGroup(trimmed);
  if (normalized) {
    const exact = scheduleAgeGroups.find(
      (option) => option.trim().toLowerCase() === normalized.toLowerCase(),
    );
    if (exact) return exact;
  }

  const extracted = extractAgeGroupFromTitle(trimmed);
  if (extracted) {
    const exact = scheduleAgeGroups.find(
      (option) => option.trim().toLowerCase() === extracted.toLowerCase(),
    );
    if (exact) return exact;

    const fuzzy = scheduleAgeGroups.find((option) => {
      const optionNorm = option.trim().toUpperCase();
      return optionNorm.startsWith(extracted.toUpperCase());
    });
    if (fuzzy) return fuzzy;
  }

  const loose = scheduleAgeGroups.find((option) => {
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
