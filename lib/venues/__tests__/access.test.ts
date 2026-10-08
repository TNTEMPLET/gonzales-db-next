import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { venuesPageAccess } from "@/lib/venues/access";
import { stagingMarkerRefusal } from "@/lib/venues/stagingGuard";
import { parseSuggestionConfirm, parseVenueLink, parseVenueWrite } from "@/lib/venues/validate";

describe("venues page access", () => {
  it("hides the page on league sites, including for a master admin", () => {
    assert.equal(
      venuesPageAccess({
        masterDeployment: false,
        authenticated: true,
        role: "MASTER_ADMIN",
      }),
      "not_found",
    );
  });

  it("asks a signed-out visitor on the master site to log in", () => {
    assert.equal(
      venuesPageAccess({ masterDeployment: true, authenticated: false, role: null }),
      "login",
    );
  });

  it("allows only a master admin on the master site", () => {
    assert.equal(
      venuesPageAccess({ masterDeployment: true, authenticated: true, role: "MASTER_ADMIN" }),
      "ok",
    );
    for (const role of ["ADMIN", "BOARD_MEMBER", "PARK_DIRECTOR"] as const) {
      assert.equal(
        venuesPageAccess({ masterDeployment: true, authenticated: true, role }),
        "forbidden",
        role,
      );
    }
    assert.equal(
      venuesPageAccess({ masterDeployment: true, authenticated: true, role: null }),
      "forbidden",
    );
  });
});

describe("venue pre-fill staging marker", () => {
  it("allows only the single staging marker", () => {
    assert.equal(stagingMarkerRefusal("staging"), null);
    assert.match(stagingMarkerRefusal("missing") ?? "", /marker is missing/);
    assert.match(stagingMarkerRefusal("multiple") ?? "", /exactly one row/);
    assert.match(stagingMarkerRefusal("production") ?? "", /not staging/);
    assert.match(stagingMarkerRefusal(null) ?? "", /not staging/);
    assert.match(stagingMarkerRefusal(" staging") ?? "", /not staging/);
  });
});

describe("venue write parsing", () => {
  it("keeps a display name and stores the normalized key", () => {
    const parsed = parseVenueWrite({
      name: "  Tee-Joe Gonzales Park ",
      shortName: " TJP ",
      address: "  ",
      notes: "Gate code is public",
      isActive: false,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.name, "Tee-Joe Gonzales Park");
    assert.equal(parsed.value.normalizedName, "tee joe gonzales park");
    assert.equal(parsed.value.shortName, "TJP");
    assert.equal(parsed.value.address, null);
    assert.equal(parsed.value.isActive, false);
  });

  it("rejects a name that normalizes to nothing", () => {
    const parsed = parseVenueWrite({ name: " --- " });
    assert.equal(parsed.ok, false);
  });

  it("reads a link and a confirm body", () => {
    const link = parseVenueLink({ scheduleParkId: " park ", venueId: "" });
    assert.equal(link.ok, true);
    if (link.ok) {
      assert.equal(link.scheduleParkId, "park");
      assert.equal(link.venueId, null);
    }
    const confirm = parseSuggestionConfirm({ parkId: " g " });
    assert.equal(confirm.ok, true);
    if (confirm.ok) assert.equal(confirm.parkId, "g");
    assert.equal(parseVenueLink(null).ok, false);
  });
});
