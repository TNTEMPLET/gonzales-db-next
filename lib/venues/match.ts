/**
 * Shared-park name matching.
 *
 * Exact key (auto-link): trim, lowercase, turn every run of non-alphanumerics
 * into one space. That collapses case, whitespace, and punctuation
 * ("Tee-Joe" and "Tee Joe", "J. Leo" and "J Leo") onto one Venue.
 *
 * Rainout identity stays trim+lowercase (`gameIsRainedOut`) so a period still
 * distinguishes alert text. Venue identity is looser on purpose: the same
 * physical park should not become two records because of a hyphen.
 *
 * Suggestion only: one normalized name contains the other, and the shorter
 * name still has a distinctive token. "Stevens Park" suggests "J Leo Stevens
 * Park" and is never auto-linked. A bare "Park" does not suggest anything,
 * which is the `venueMatchesPark` substring rule with the generic word removed.
 */

const GENERIC_TOKENS = new Set([
  "and",
  "at",
  "center",
  "complex",
  "field",
  "fields",
  "of",
  "park",
  "parks",
  "the",
]);

export type VenueMatchPark = {
  id: string;
  organizationId: string;
  name: string;
  shortName?: string | null;
  address?: string | null;
  venueId?: string | null;
};

export type VenueMatchVenue = {
  id: string;
  name: string;
  normalizedName: string;
};

export type VenueCreateSpec = {
  normalizedName: string;
  name: string;
  shortName: string | null;
  address: string | null;
  parkIds: string[];
};

export type VenueLinkSpec = {
  parkId: string;
  venueId: string;
};

export type VenueSuggestion = {
  parkId: string;
  label: string;
  normalizedName: string;
  venueId: string | null;
  counterpartParkId: string | null;
  score: number;
};

export type VenueMatchPlan = {
  creates: VenueCreateSpec[];
  links: VenueLinkSpec[];
  suggestions: VenueSuggestion[];
  alreadyLinkedParkIds: string[];
  unmatchedParkIds: string[];
};

export type VenueMatchSummary = {
  venuesToCreate: number;
  parksToLink: number;
  alreadyLinked: number;
  unmatched: number;
  suggested: number;
};

export type SuggestionConfirm =
  | { action: "none" }
  | { action: "link"; parkId: string; venueId: string }
  | { action: "create-and-link"; create: VenueCreateSpec };

export function normalizeVenueName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/ +/g, " ");
}

export function venueNamesAreExactMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeVenueName(left);
  const b = normalizeVenueName(right);
  return a.length > 0 && a === b;
}

export function venueNamesAreSuggestedMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeVenueName(left);
  const b = normalizeVenueName(right);
  if (!a || !b || a === b) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!longer.includes(shorter)) return false;
  return significantTokens(shorter).length > 0;
}

function significantTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token));
}

function linkedVenueId(park: VenueMatchPark): string | null {
  const id = park.venueId?.trim() ?? "";
  return id || null;
}

function chooseCanonicalName(names: string[]): string {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  unique.sort((a, b) => nameRank(a) - nameRank(b) || a.localeCompare(b));
  return unique[0] ?? "";
}

function nameRank(name: string): number {
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (!letters) return 3;
  const hasUpper = /[A-Z]/.test(letters);
  const hasLower = /[a-z]/.test(letters);
  if (hasUpper && hasLower) return 0;
  if (!hasUpper && hasLower) return 1;
  return 2;
}

function sharedOptional(values: Array<string | null | undefined>): string | null {
  const distinct = [
    ...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)),
  ];
  return distinct.length === 1 ? distinct[0]! : null;
}

function containedLength(left: string, right: string): number {
  return Math.min(left.length, right.length);
}

export function buildVenueMatchPlan(
  parks: readonly VenueMatchPark[],
  venues: readonly VenueMatchVenue[],
): VenueMatchPlan {
  const venueByKey = new Map<string, VenueMatchVenue>();
  for (const venue of venues) {
    const key = venue.normalizedName.trim();
    if (!key || venueByKey.has(key)) continue;
    venueByKey.set(key, venue);
  }

  const alreadyLinkedParkIds: string[] = [];
  const unmatchedParkIds: string[] = [];
  const openByKey = new Map<string, VenueMatchPark[]>();

  for (const park of parks) {
    if (linkedVenueId(park)) {
      alreadyLinkedParkIds.push(park.id);
      continue;
    }
    const key = normalizeVenueName(park.name);
    if (!key) {
      unmatchedParkIds.push(park.id);
      continue;
    }
    const group = openByKey.get(key);
    if (group) group.push(park);
    else openByKey.set(key, [park]);
  }

  const creates: VenueCreateSpec[] = [];
  const links: VenueLinkSpec[] = [];
  const openNamed: VenueMatchPark[] = [];

  const keys = [...openByKey.keys()].sort();
  for (const key of keys) {
    const group = openByKey.get(key) ?? [];
    openNamed.push(...group);
    const existing = venueByKey.get(key);
    if (existing) {
      for (const park of group) links.push({ parkId: park.id, venueId: existing.id });
      continue;
    }
    const parkIds = group.map((park) => park.id).sort();
    creates.push({
      normalizedName: key,
      name: chooseCanonicalName(group.map((park) => park.name)),
      shortName: sharedOptional(group.map((park) => park.shortName)),
      address: sharedOptional(group.map((park) => park.address)),
      parkIds,
    });
  }

  const suggestions: VenueSuggestion[] = [];
  for (const park of openNamed) {
    const parkKey = normalizeVenueName(park.name);
    const candidates: VenueSuggestion[] = [];
    for (const venue of venueByKey.values()) {
      if (!venueNamesAreSuggestedMatch(park.name, venue.name)) continue;
      candidates.push({
        parkId: park.id,
        label: venue.name.trim(),
        normalizedName: venue.normalizedName,
        venueId: venue.id,
        counterpartParkId: null,
        score: containedLength(parkKey, normalizeVenueName(venue.name)),
      });
    }
    for (const other of openNamed) {
      if (other.id === park.id) continue;
      const otherKey = normalizeVenueName(other.name);
      if (!otherKey || otherKey === parkKey) continue;
      if (venueByKey.has(otherKey)) continue;
      if (!venueNamesAreSuggestedMatch(park.name, other.name)) continue;
      candidates.push({
        parkId: park.id,
        label: other.name.trim(),
        normalizedName: otherKey,
        venueId: null,
        counterpartParkId: other.id,
        score: containedLength(parkKey, otherKey),
      });
    }
    candidates.sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.venueId == null) - Number(b.venueId == null) ||
        a.label.localeCompare(b.label) ||
        (a.counterpartParkId ?? "").localeCompare(b.counterpartParkId ?? ""),
    );
    if (candidates[0]) suggestions.push(candidates[0]);
  }

  alreadyLinkedParkIds.sort();
  unmatchedParkIds.sort();
  links.sort((a, b) => a.parkId.localeCompare(b.parkId));
  suggestions.sort((a, b) => a.parkId.localeCompare(b.parkId));

  return { creates, links, suggestions, alreadyLinkedParkIds, unmatchedParkIds };
}

export function summarizeVenueMatchPlan(plan: VenueMatchPlan): VenueMatchSummary {
  const createdParkCount = plan.creates.reduce((sum, create) => sum + create.parkIds.length, 0);
  return {
    venuesToCreate: plan.creates.length,
    parksToLink: plan.links.length + createdParkCount,
    alreadyLinked: plan.alreadyLinkedParkIds.length,
    unmatched: plan.unmatchedParkIds.length,
    suggested: plan.suggestions.length,
  };
}

export function confirmSuggestionPlan(
  parkId: string,
  parks: readonly VenueMatchPark[],
  venues: readonly VenueMatchVenue[],
): SuggestionConfirm {
  const plan = buildVenueMatchPlan(parks, venues);
  const exact = plan.links.find((item) => item.parkId === parkId);
  if (exact) return { action: "link", parkId, venueId: exact.venueId };
  const suggestion = plan.suggestions.find((item) => item.parkId === parkId);
  if (!suggestion) return { action: "none" };
  if (suggestion.venueId) {
    return { action: "link", parkId, venueId: suggestion.venueId };
  }

  const park = parks.find((item) => item.id === parkId);
  const counterpart = parks.find((item) => item.id === suggestion.counterpartParkId);
  if (!park || !counterpart) return { action: "none" };

  const parkKey = normalizeVenueName(park.name);
  const otherKey = normalizeVenueName(counterpart.name);
  if (!parkKey || !otherKey) return { action: "none" };
  const specificKey = parkKey.length >= otherKey.length ? parkKey : otherKey;

  const open = parks.filter((item) => !linkedVenueId(item));
  const specificGroup = open.filter((item) => normalizeVenueName(item.name) === specificKey);
  const otherGroup = open.filter((item) => {
    const key = normalizeVenueName(item.name);
    return key === parkKey || key === otherKey;
  });
  const parkIds = [...new Set(otherGroup.map((item) => item.id))].sort();
  if (!specificGroup.length || !parkIds.includes(parkId)) return { action: "none" };

  return {
    action: "create-and-link",
    create: {
      normalizedName: specificKey,
      name: chooseCanonicalName(specificGroup.map((item) => item.name)),
      shortName: sharedOptional(specificGroup.map((item) => item.shortName)),
      address: sharedOptional(specificGroup.map((item) => item.address)),
      parkIds,
    },
  };
}
