import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allowedScheduleGameIds,
  decideParkDirectorGameWrite,
  postedLeagueScoreTarget,
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

  it("refuses a cross-league unlinked park and allows a matching venue", () => {
    assert.deepEqual(
      decideParkDirectorGameWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: NORTH,
        park: { venueId: null },
        roleOnGameLeague: false,
      }),
      { allowed: false, reason: "park_unlinked" },
    );
    assert.deepEqual(
      decideParkDirectorGameWrite({
        isMaster: false,
        role: null,
        activeVenueIds: [],
        park: { venueId: null },
        roleOnGameLeague: false,
      }),
      { allowed: false, reason: "park_unlinked" },
    );
    assert.deepEqual(
      decideParkDirectorGameWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: NORTH,
        park: { venueId: "venue-east" },
        roleOnGameLeague: false,
      }),
      { allowed: false, reason: "other_venue" },
    );
    assert.deepEqual(
      decideParkDirectorGameWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: NORTH,
        park: { venueId: "venue-north" },
        roleOnGameLeague: false,
      }),
      { allowed: true, reason: "assigned_venue" },
    );
    assert.deepEqual(
      decideParkDirectorGameWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        activeVenueIds: NORTH,
        park: { venueId: null },
        roleOnGameLeague: true,
      }),
      { allowed: true, reason: "park_unlinked" },
    );
    const cross = allowedScheduleGameIds({
      isMaster: false,
      role: "PARK_DIRECTOR",
      activeVenueIds: [],
      games: [{ id: "open", venueId: null, roleOnGameLeague: false }],
    });
    assert.notEqual(cross, "unrestricted");
    if (cross !== "unrestricted") assert.deepEqual([...cross], []);
  });

  it("scores a posted game under the schedule row org, not a client org", () => {
    const posted = {
      organizationId: "fallball",
      status: "LOCKED",
      venueId: null as string | null,
    };
    assert.deepEqual(
      postedLeagueScoreTarget({
        isMaster: false,
        roleOnGameOrg: null,
        activeVenueIds: [],
        game: posted,
      }),
      { ok: false, error: "denied" },
    );
    assert.deepEqual(
      postedLeagueScoreTarget({
        isMaster: false,
        roleOnGameOrg: null,
        activeVenueIds: ["venue-north"],
        game: { ...posted, venueId: null },
      }),
      { ok: false, error: "denied" },
    );
    assert.deepEqual(
      postedLeagueScoreTarget({
        isMaster: false,
        roleOnGameOrg: null,
        activeVenueIds: ["venue-north"],
        game: { ...posted, venueId: "venue-north" },
      }),
      { ok: true, organizationId: "fallball" },
    );
    assert.deepEqual(
      postedLeagueScoreTarget({
        isMaster: false,
        roleOnGameOrg: "PARK_DIRECTOR",
        activeVenueIds: [],
        game: { ...posted, organizationId: "gonzales" },
      }),
      { ok: true, organizationId: "gonzales" },
    );
    assert.deepEqual(
      postedLeagueScoreTarget({
        isMaster: false,
        roleOnGameOrg: "PARK_DIRECTOR",
        activeVenueIds: ["venue-north"],
        game: { organizationId: "gonzales", status: "LOCKED", venueId: null },
      }),
      { ok: true, organizationId: "gonzales" },
    );
    assert.deepEqual(
      postedLeagueScoreTarget({
        isMaster: false,
        roleOnGameOrg: "PARK_DIRECTOR",
        activeVenueIds: [],
        game: { ...posted, status: "DRAFT" },
      }),
      { ok: false, error: "not_posted" },
    );
    assert.equal(
      postedLeagueScoreTarget({
        isMaster: false,
        roleOnGameOrg: "ADMIN",
        activeVenueIds: [],
        game: { organizationId: "ascension", status: "EXPORTED", venueId: "venue-east" },
      }).ok,
      true,
    );
  });
});
