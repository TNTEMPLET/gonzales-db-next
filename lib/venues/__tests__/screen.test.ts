import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildParksScreen } from "@/lib/venues/screen";

describe("parks screen model", () => {
  it("marks a near-miss as suggested until it is linked", () => {
    const model = buildParksScreen(
      [
        {
          id: "g",
          organizationId: "gonzales",
          name: "Stevens Park",
          shortName: null,
          address: null,
          isActive: true,
          venueId: null,
        },
        {
          id: "a",
          organizationId: "ascension",
          name: "J Leo Stevens Park",
          shortName: null,
          address: null,
          isActive: true,
          venueId: null,
        },
      ],
      [],
    );
    assert.equal(model.counts.suggested, 2);
    assert.equal(model.counts.unlinked, 0);
    assert.equal(model.counts.linked, 0);
    const gonzales = model.parks.find((park) => park.id === "g");
    assert.equal(gonzales?.organizationLabel, "Gonzales DYB");
    assert.equal(gonzales?.status, "suggested");
    assert.match(gonzales?.suggestion?.label ?? "", /J Leo Stevens Park/);
    assert.match(gonzales?.suggestion?.label ?? "", /Ascension LL/);
    assert.equal(model.parks[0]?.id, "g");
    assert.equal(model.parks[1]?.id, "a");
  });

  it("keeps a linked near-miss linked and points at the other shared park", () => {
    const model = buildParksScreen(
      [
        {
          id: "g",
          organizationId: "gonzales",
          name: "Stevens Park",
          isActive: true,
          venueId: "v1",
        },
        {
          id: "a",
          organizationId: "ascension",
          name: "J Leo Stevens Park",
          isActive: false,
          venueId: "v2",
        },
      ],
      [
        {
          id: "v1",
          name: "Stevens Park",
          normalizedName: "stevens park",
          isActive: true,
        },
        {
          id: "v2",
          name: "J Leo Stevens Park",
          normalizedName: "j leo stevens park",
          shortName: "JLS",
          isActive: true,
        },
      ],
    );
    assert.equal(model.counts.linked, 2);
    assert.equal(model.counts.suggested, 0);
    const stevens = model.parks.find((park) => park.id === "g");
    assert.equal(stevens?.status, "linked");
    assert.equal(stevens?.venueName, "Stevens Park");
    assert.equal(stevens?.similarVenue?.id, "v2");
    assert.equal(model.venues.find((venue) => venue.id === "v1")?.leagueParkCount, 1);
    assert.equal(model.parks.find((park) => park.id === "a")?.sameNameLabels.length, 0);
  });

  it("notes the other league when two parks share an exact name", () => {
    const model = buildParksScreen(
      [
        {
          id: "g",
          organizationId: "gonzales",
          name: "Paula Park",
          isActive: true,
          venueId: null,
        },
        {
          id: "a",
          organizationId: "ascension",
          name: "Paula Park",
          isActive: true,
          venueId: null,
        },
      ],
      [],
    );
    assert.equal(model.parks.every((park) => park.status === "unlinked"), true);
    assert.deepEqual(model.parks.find((park) => park.id === "g")?.sameNameLabels, ["Ascension LL"]);
    assert.deepEqual(model.parks.find((park) => park.id === "a")?.sameNameLabels, ["Gonzales DYB"]);
  });

  it("offers an exact existing shared park as a confirmable suggestion", () => {
    const model = buildParksScreen(
      [
        {
          id: "g",
          organizationId: "gonzales",
          name: "Paula Park",
          isActive: true,
          venueId: null,
        },
      ],
      [
        {
          id: "v1",
          name: "Paula Park",
          normalizedName: "paula park",
          isActive: true,
        },
      ],
    );
    const park = model.parks[0];
    assert.equal(park?.status, "suggested");
    assert.equal(park?.suggestion?.exact, true);
    assert.equal(park?.suggestion?.venueId, "v1");
    assert.equal(model.counts.suggested, 1);
  });
});
