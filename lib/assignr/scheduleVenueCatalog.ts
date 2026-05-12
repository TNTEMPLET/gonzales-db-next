import type { Game } from "@/lib/fetchGames";

import type { VenueCatalogEntry } from "@/lib/assignr/gamesImportTypes";
import { fieldMappingKey } from "@/lib/assignr/gamesImportTypes";

export function normalizeVenueLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function buildVenueCatalog(games: Game[]): VenueCatalogEntry[] {
  const seen = new Set<string>();
  const entries: VenueCatalogEntry[] = [];

  for (const game of games) {
    const venue =
      typeof game._embedded?.venue?.name === "string"
        ? game._embedded.venue.name.trim()
        : "";
    const subVenue =
      typeof game.subvenue === "string" ? game.subvenue.trim() : "";
    if (!venue) continue;

    const key = `${normalizeVenueLabel(venue)}::${normalizeVenueLabel(subVenue)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ venue, subVenue });
  }

  return entries.sort((a, b) => {
    const venueCompare = a.venue.localeCompare(b.venue);
    if (venueCompare !== 0) return venueCompare;
    return a.subVenue.localeCompare(b.subVenue);
  });
}

export function listDistinctVenues(catalog: VenueCatalogEntry[]) {
  return Array.from(new Set(catalog.map((entry) => entry.venue))).sort();
}

export function listSubVenuesForVenue(
  catalog: VenueCatalogEntry[],
  venue: string,
) {
  const normalizedVenue = venue.trim().toLowerCase();
  return catalog
    .filter((entry) => entry.venue.trim().toLowerCase() === normalizedVenue)
    .map((entry) => entry.subVenue)
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort();
}

export function suggestSubVenueForField(params: {
  sourcePark: string;
  sourceField: string;
  mappedVenue: string | null;
  catalog: VenueCatalogEntry[];
}) {
  const { sourcePark, sourceField, mappedVenue, catalog } = params;
  const rawField = sourceField.trim();
  if (!rawField) return null;

  const scopedCatalog = mappedVenue
    ? catalog.filter(
        (entry) =>
          entry.venue.trim().toLowerCase() === mappedVenue.trim().toLowerCase(),
      )
    : catalog;

  const exact = scopedCatalog.find(
    (entry) =>
      normalizeVenueLabel(entry.subVenue) === normalizeVenueLabel(rawField),
  );
  if (exact) return exact.subVenue;

  const parkNorm = normalizeVenueLabel(sourcePark);
  const fieldNorm = normalizeVenueLabel(rawField);

  if (/^\d+$/.test(rawField) && parkNorm.includes("stevens")) {
    const stevensNamed = scopedCatalog.find((entry) =>
      normalizeVenueLabel(entry.subVenue).includes(`stevens${rawField}`),
    );
    if (stevensNamed) return stevensNamed.subVenue;

    const numbered = scopedCatalog.find(
      (entry) => normalizeVenueLabel(entry.subVenue) === fieldNorm,
    );
    if (numbered) return numbered.subVenue;
  }

  const fuzzy = scopedCatalog.find((entry) => {
    const subNorm = normalizeVenueLabel(entry.subVenue);
    return subNorm.includes(fieldNorm) || fieldNorm.includes(subNorm);
  });
  return fuzzy?.subVenue ?? null;
}

export function buildSuggestedFieldMappings(params: {
  drafts: Array<{ sourcePark: string; sourceField: string }>;
  parkMappings: Record<string, string>;
  catalog: VenueCatalogEntry[];
}) {
  const suggestions: Record<string, string> = {};

  for (const draft of params.drafts) {
    const key = fieldMappingKey(draft.sourcePark, draft.sourceField);
    if (suggestions[key]) continue;

    const mappedVenue = params.parkMappings[draft.sourcePark.trim()] ?? null;
    const suggestion = suggestSubVenueForField({
      sourcePark: draft.sourcePark,
      sourceField: draft.sourceField,
      mappedVenue,
      catalog: params.catalog,
    });
    if (suggestion) {
      suggestions[key] = suggestion;
    }
  }

  return suggestions;
}
