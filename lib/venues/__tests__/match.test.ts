import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildVenueMatchPlan,
  confirmSuggestionPlan,
  normalizeVenueName,
  summarizeVenueMatchPlan,
  venueNamesAreExactMatch,
  venueNamesAreSuggestedMatch,
  type VenueMatchPark,
  type VenueMatchVenue,
} from "@/lib/venues/match";

const FALL_BALL_PARKS: VenueMatchPark[] = [
  { id: "jls", organizationId: "fallball", name: "J Leo Stevens Park", shortName: "JLS" },
  { id: "pau", organizationId: "fallball", name: "Paula Park", shortName: "PAU" },
  {
    id: "rjc",
    organizationId: "fallball",
    name: "Roger J. Clouatre Memorial Park",
    shortName: "RJC",
  },
  { id: "tjp", organizationId: "fallball", name: "Tee-Joe Gonzales Park", shortName: "TJP" },
];

function applyPlan(
  parks: VenueMatchPark[],
  venues: VenueMatchVenue[],
) {
  const plan = buildVenueMatchPlan(parks, venues);
  const nextVenues = venues.map((venue) => ({ ...venue }));
  let nextParks = parks.map((park) => ({ ...park, venueId: park.venueId ?? null }));
  plan.creates.forEach((create, index) => {
    const id = `created-${index + 1}`;
    nextVenues.push({ id, name: create.name, normalizedName: create.normalizedName });
    const ids = new Set(create.parkIds);
    nextParks = nextParks.map((park) =>
      ids.has(park.id) && !park.venueId ? { ...park, venueId: id } : park,
    );
  });
  for (const link of plan.links) {
    nextParks = nextParks.map((park) =>
      park.id === link.parkId && !park.venueId ? { ...park, venueId: link.venueId } : park,
    );
  }
  return { plan, parks: nextParks, venues: nextVenues };
}

describe("venue name normalization", () => {
  it("collapses case, whitespace, and punctuation", () => {
    assert.equal(normalizeVenueName("  Paula   Park "), "paula park");
    assert.equal(normalizeVenueName("PAULA PARK"), "paula park");
    assert.equal(
      normalizeVenueName("Roger J. Clouatre Memorial Park"),
      "roger j clouatre memorial park",
    );
    assert.equal(normalizeVenueName("Tee-Joe Gonzales Park"), "tee joe gonzales park");
    assert.equal(normalizeVenueName("Tee Joe Gonzales Park"), "tee joe gonzales park");
    assert.equal(normalizeVenueName(null), "");
    assert.equal(normalizeVenueName(" --- "), "");
    assert.equal(venueNamesAreExactMatch("Paula Park", " paula   park "), true);
    assert.equal(venueNamesAreExactMatch("Tee-Joe Gonzales Park", "Tee Joe Gonzales Park"), true);
    assert.equal(venueNamesAreExactMatch("Stevens Park", "J Leo Stevens Park"), false);
  });

  it("suggests a contained distinctive name and ignores a bare Park", () => {
    assert.equal(venueNamesAreSuggestedMatch("Stevens Park", "J Leo Stevens Park"), true);
    assert.equal(venueNamesAreSuggestedMatch("J Leo Stevens Park", "Stevens Park"), true);
    assert.equal(venueNamesAreSuggestedMatch("Park", "Paula Park"), false);
    assert.equal(venueNamesAreSuggestedMatch("Paula Park", "J Leo Stevens Park"), false);
    assert.equal(venueNamesAreSuggestedMatch("Paula Park", "Paula Park"), false);
  });
});

describe("venue match plan", () => {
  it("turns today's four Fall Ball parks into four venues and four links", () => {
    const plan = buildVenueMatchPlan(FALL_BALL_PARKS, []);
    const summary = summarizeVenueMatchPlan(plan);
    assert.equal(summary.venuesToCreate, 4);
    assert.equal(summary.parksToLink, 4);
    assert.equal(summary.alreadyLinked, 0);
    assert.equal(summary.unmatched, 0);
    assert.equal(summary.suggested, 0);
    const teeJoe = plan.creates.find((create) => create.normalizedName === "tee joe gonzales park");
    assert.equal(teeJoe?.name, "Tee-Joe Gonzales Park");
    assert.equal(teeJoe?.shortName, "TJP");
    assert.deepEqual(teeJoe?.parkIds, ["tjp"]);
  });

  it("links the same name across leagues to one venue", () => {
    const plan = buildVenueMatchPlan(
      [
        { id: "g", organizationId: "gonzales", name: "Stevens Park", shortName: "STP", address: "1 Main" },
        {
          id: "a",
          organizationId: "ascension",
          name: "  stevens   park ",
          shortName: "STP",
          address: "1 Main",
        },
      ],
      [],
    );
    assert.equal(plan.creates.length, 1);
    assert.equal(plan.links.length, 0);
    assert.equal(plan.creates[0]?.normalizedName, "stevens park");
    assert.equal(plan.creates[0]?.name, "Stevens Park");
    assert.equal(plan.creates[0]?.shortName, "STP");
    assert.equal(plan.creates[0]?.address, "1 Main");
    assert.deepEqual(plan.creates[0]?.parkIds, ["a", "g"]);
    assert.equal(summarizeVenueMatchPlan(plan).parksToLink, 2);
  });

  it("does not auto-link a near-miss name", () => {
    const plan = buildVenueMatchPlan(
      [
        { id: "g", organizationId: "gonzales", name: "Stevens Park", shortName: "SP" },
        { id: "a", organizationId: "ascension", name: "J Leo Stevens Park", shortName: "JLS" },
      ],
      [],
    );
    assert.equal(plan.creates.length, 2);
    assert.equal(new Set(plan.creates.flatMap((create) => create.parkIds)).size, 2);
    const suggestion = plan.suggestions.find((item) => item.parkId === "g");
    assert.equal(suggestion?.venueId, null);
    assert.equal(suggestion?.counterpartParkId, "a");
    assert.equal(suggestion?.label, "J Leo Stevens Park");
    const confirm = confirmSuggestionPlan("g", [
      { id: "g", organizationId: "gonzales", name: "Stevens Park", shortName: "SP" },
      { id: "a", organizationId: "ascension", name: "J Leo Stevens Park", shortName: "JLS", address: "100 Stevens" },
    ], []);
    assert.equal(confirm.action, "create-and-link");
    if (confirm.action !== "create-and-link") return;
    assert.equal(confirm.create.normalizedName, "j leo stevens park");
    assert.equal(confirm.create.name, "J Leo Stevens Park");
    assert.equal(confirm.create.shortName, "JLS");
    assert.equal(confirm.create.address, "100 Stevens");
    assert.deepEqual(confirm.create.parkIds, ["a", "g"]);
  });

  it("leaves an existing link untouched, even when another venue is an exact name match", () => {
    const venues: VenueMatchVenue[] = [
      { id: "v-custom", name: "Somewhere Else", normalizedName: "somewhere else" },
      { id: "v-stevens", name: "Stevens Park", normalizedName: "stevens park" },
    ];
    const parks: VenueMatchPark[] = [
      { id: "g", organizationId: "gonzales", name: "Stevens Park", venueId: "v-custom" },
      { id: "a", organizationId: "ascension", name: "Stevens Park", venueId: null },
    ];
    const plan = buildVenueMatchPlan(parks, venues);
    assert.deepEqual(plan.alreadyLinkedParkIds, ["g"]);
    assert.equal(plan.creates.some((create) => create.parkIds.includes("g")), false);
    assert.deepEqual(plan.creates, []);
    assert.deepEqual(plan.links, [{ parkId: "a", venueId: "v-stevens" }]);
    assert.equal(plan.links.some((link) => link.parkId === "g"), false);
  });

  it("is a no-op when the same parks and venues are planned again", () => {
    const first = applyPlan(
      [
        { id: "g", organizationId: "gonzales", name: "Stevens Park" },
        { id: "a", organizationId: "ascension", name: "stevens park" },
        { id: "blank", organizationId: "fallball", name: "   " },
      ],
      [],
    );
    assert.equal(first.plan.creates.length, 1);
    assert.deepEqual(first.plan.unmatchedParkIds, ["blank"]);
    const second = buildVenueMatchPlan(first.parks, first.venues);
    assert.deepEqual(second.creates, []);
    assert.deepEqual(second.links, []);
    assert.deepEqual(second.alreadyLinkedParkIds, ["a", "g"]);
    assert.deepEqual(second.unmatchedParkIds, ["blank"]);
    const again = applyPlan(first.parks, first.venues);
    assert.deepEqual(
      again.parks.map((park) => [park.id, park.venueId]),
      first.parks.map((park) => [park.id, park.venueId]),
    );
  });

  it("confirms a suggestion onto an existing venue without creating another", () => {
    const venues: VenueMatchVenue[] = [
      { id: "v1", name: "J Leo Stevens Park", normalizedName: "j leo stevens park" },
    ];
    const parks: VenueMatchPark[] = [
      { id: "g", organizationId: "gonzales", name: "Stevens Park", venueId: null },
    ];
    assert.deepEqual(confirmSuggestionPlan("g", parks, venues), {
      action: "link",
      parkId: "g",
      venueId: "v1",
    });
    assert.deepEqual(
      confirmSuggestionPlan(
        "pau",
        [{ id: "pau", organizationId: "fallball", name: "Paula Park" }],
        [{ id: "v-pau", name: "Paula Park", normalizedName: "paula park" }],
      ),
      { action: "link", parkId: "pau", venueId: "v-pau" },
    );
    assert.deepEqual(
      confirmSuggestionPlan("g", [{ ...parks[0]!, venueId: "v1" }], venues),
      { action: "none" },
    );
    assert.equal(
      confirmSuggestionPlan("missing", parks, venues).action,
      "none",
    );
  });

  it("does not group blank names into a shared venue", () => {
    const plan = buildVenueMatchPlan(
      [
        { id: "a", organizationId: "gonzales", name: "  " },
        { id: "b", organizationId: "ascension", name: "" },
      ],
      [],
    );
    assert.deepEqual(plan.creates, []);
    assert.deepEqual(plan.suggestions, []);
    assert.deepEqual(plan.unmatchedParkIds, ["a", "b"]);
  });

  it("drops a short name when the same park disagrees across leagues", () => {
    const plan = buildVenueMatchPlan(
      [
        { id: "g", organizationId: "gonzales", name: "Paula Park", shortName: "PAU" },
        { id: "a", organizationId: "ascension", name: "Paula Park", shortName: "P" },
      ],
      [],
    );
    assert.equal(plan.creates[0]?.shortName, null);
  });
});
