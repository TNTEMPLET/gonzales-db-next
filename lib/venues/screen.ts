import { formatOrganizationIdDisplay } from "@/lib/siteConfig";
import {
  buildVenueMatchPlan,
  normalizeVenueName,
  venueNamesAreSuggestedMatch,
  type VenueMatchPark,
  type VenueMatchVenue,
  type VenueSuggestion,
} from "@/lib/venues/match";

const ORG_ORDER = ["gonzales", "ascension", "fallball"];

export type ParksScreenVenueInput = VenueMatchVenue & {
  shortName?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
};

export type ParksScreenParkInput = VenueMatchPark & {
  isActive: boolean;
};

export type ParksScreenVenue = {
  id: string;
  name: string;
  shortName: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  normalizedName: string;
  leagueParkCount: number;
};

export type ParksScreenPark = {
  id: string;
  organizationId: string;
  organizationLabel: string;
  name: string;
  shortName: string | null;
  address: string | null;
  isActive: boolean;
  venueId: string | null;
  venueName: string | null;
  status: "linked" | "suggested" | "unlinked";
  suggestion: { label: string; venueId: string | null; exact: boolean } | null;
  similarVenue: { id: string; name: string } | null;
  sameNameLabels: string[];
};

export type ParksScreenModel = {
  venues: ParksScreenVenue[];
  parks: ParksScreenPark[];
  counts: {
    venues: number;
    linked: number;
    suggested: number;
    unlinked: number;
  };
};

export function buildParksScreen(
  parks: readonly ParksScreenParkInput[],
  venues: readonly ParksScreenVenueInput[],
): ParksScreenModel {
  const plan = buildVenueMatchPlan(parks, venues);
  const suggestionByPark = new Map<string, VenueSuggestion>(
    plan.suggestions.map((suggestion) => [suggestion.parkId, suggestion]),
  );
  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const parkById = new Map(parks.map((park) => [park.id, park]));

  const screenVenues: ParksScreenVenue[] = [...venues]
    .map((venue) => ({
      id: venue.id,
      name: venue.name,
      shortName: venue.shortName?.trim() || null,
      address: venue.address?.trim() || null,
      notes: venue.notes?.trim() || null,
      isActive: venue.isActive,
      normalizedName: venue.normalizedName,
      leagueParkCount: parks.filter((park) => park.venueId === venue.id).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  const screenParks = [...parks]
    .map((park) => {
      const venueId = park.venueId?.trim() || null;
      const exactLink = plan.links.find((link) => link.parkId === park.id);
      const fuzzy = suggestionByPark.get(park.id) ?? null;
      const suggestion = venueId
        ? null
        : exactLink
          ? {
              label: venueById.get(exactLink.venueId)?.name ?? "Shared park",
              venueId: exactLink.venueId,
              exact: true,
            }
          : fuzzy
            ? {
                label: suggestionLabel(fuzzy, parkById),
                venueId: fuzzy.venueId,
                exact: false,
              }
            : null;
      const status: ParksScreenPark["status"] = venueId
        ? "linked"
        : suggestion
          ? "suggested"
          : "unlinked";
      const key = normalizeVenueName(park.name);
      const sameNameLabels = uniqueLabels(
        parks
          .filter((other) => other.id !== park.id && normalizeVenueName(other.name) === key && key)
          .map((other) => formatOrganizationIdDisplay(other.organizationId)),
      );
      return {
        id: park.id,
        organizationId: park.organizationId,
        organizationLabel: formatOrganizationIdDisplay(park.organizationId),
        name: park.name,
        shortName: park.shortName?.trim() || null,
        address: park.address?.trim() || null,
        isActive: park.isActive,
        venueId,
        venueName: venueId ? venueById.get(venueId)?.name ?? null : null,
        status,
        suggestion,
        similarVenue: bestSimilarVenue(park.name, venueId, venues),
        sameNameLabels,
      };
    })
    .sort(compareParks);

  return {
    venues: screenVenues,
    parks: screenParks,
    counts: {
      venues: screenVenues.length,
      linked: screenParks.filter((park) => park.status === "linked").length,
      suggested: screenParks.filter((park) => park.status === "suggested").length,
      unlinked: screenParks.filter((park) => park.status === "unlinked").length,
    },
  };
}

function suggestionLabel(
  suggestion: VenueSuggestion,
  parkById: Map<string, ParksScreenParkInput>,
): string {
  if (suggestion.venueId || !suggestion.counterpartParkId) return suggestion.label;
  const counterpart = parkById.get(suggestion.counterpartParkId);
  if (!counterpart) return suggestion.label;
  return `${suggestion.label} (${formatOrganizationIdDisplay(counterpart.organizationId)})`;
}

function bestSimilarVenue(
  parkName: string,
  currentVenueId: string | null,
  venues: readonly ParksScreenVenueInput[],
): { id: string; name: string } | null {
  const matches = venues
    .filter(
      (venue) =>
        venue.id !== currentVenueId && venueNamesAreSuggestedMatch(parkName, venue.name),
    )
    .sort(
      (a, b) =>
        normalizeVenueName(b.name).length - normalizeVenueName(a.name).length ||
        a.name.localeCompare(b.name),
    );
  const best = matches[0];
  return best ? { id: best.id, name: best.name } : null;
}

function uniqueLabels(labels: string[]): string[] {
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}

function compareParks(a: ParksScreenPark, b: ParksScreenPark): number {
  const org = orgRank(a.organizationId) - orgRank(b.organizationId);
  if (org !== 0) return org;
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function orgRank(organizationId: string): number {
  const index = ORG_ORDER.indexOf(organizationId);
  return index === -1 ? ORG_ORDER.length : index;
}
