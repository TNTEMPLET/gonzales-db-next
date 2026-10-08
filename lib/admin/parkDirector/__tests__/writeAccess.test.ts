import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowedScheduleGameIds,
  decideParkDirectorGameWrite,
} from "@/lib/admin/parkDirector/writeAccess";

const NORTH = ["venue-north"];

describe("park director game write checks", () => {
  it("leaves admins, board members, and master admins unrestricted", () => {
    for (const role of ["ADMIN", "BOARD_MEMBER", "MASTER_ADMIN"] as const) {
      const decision = decideParkDirectorGameWrite({
        isMaster: role === "MASTER_ADMIN",
        role,
        activeVenueIds: NORTH,
        park: { venueId: "venue-east" },
      });
      assert.equal(decision.allowed, true);
      assert.equal(decision.reason, "not_park_director");
    }
    assert.equal(
      decideParkDirectorGameWrite({
        isMaster: true,
        role: "PARK_DIRECTOR",
        activeVenueIds: NORTH,
        park: { venueId: "venue-east" },
      }).reason,
      "not_park_director",
    );
  });

  it("keeps today's access when a director has no active assignments", () => {
    for (const park of [null, { venueId: null }, { venueId: "venue-east" }] as const) {
      const decision = decideParkDirectorGameWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: [],
        park,
      });
      assert.equal(decision.allowed, true, JSON.stringify(park));
      assert.equal(decision.reason, "no_assignments");
    }
  });

  it("allows an assigned venue and an unlinked park, and refuses a different venue", () => {
    assert.deepEqual(
      decideParkDirectorGameWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: NORTH,
        park: { venueId: "venue-north" },
      }),
      { allowed: true, reason: "assigned_venue" },
    );
    assert.deepEqual(
      decideParkDirectorGameWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: NORTH,
        park: { venueId: null },
      }),
      { allowed: true, reason: "park_unlinked" },
    );
    assert.deepEqual(
      decideParkDirectorGameWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: NORTH,
        park: null,
      }),
      { allowed: false, reason: "game_not_found" },
    );
    assert.deepEqual(
      decideParkDirectorGameWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: NORTH,
        park: { venueId: "venue-east" },
      }),
      { allowed: false, reason: "other_venue" },
    );
  });

  it("builds the writable game id set from venue links", () => {
    assert.equal(
      allowedScheduleGameIds({
        isMaster: false,
        role: "ADMIN",
        activeVenueIds: NORTH,
        games: [{ id: "other", venueId: "venue-east" }],
      }),
      "unrestricted",
    );
    assert.equal(
      allowedScheduleGameIds({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: [],
        games: [{ id: "any", venueId: "venue-east" }],
      }),
      "unrestricted",
    );
    const allowed = allowedScheduleGameIds({
      isMaster: false,
      role: "PARK_DIRECTOR",
      activeVenueIds: NORTH,
      games: [
        { id: "mine", venueId: "venue-north" },
        { id: "open", venueId: null },
        { id: "theirs", venueId: "venue-east" },
      ],
    });
    assert.notEqual(allowed, "unrestricted");
    if (allowed === "unrestricted") return;
    assert.deepEqual([...allowed].sort(), ["mine", "open"]);
  });
});
