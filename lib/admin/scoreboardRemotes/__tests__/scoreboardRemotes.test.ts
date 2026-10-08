import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideParkDirectorGameWrite } from "@/lib/admin/parkDirector/writeAccess";
import { decideRemoteInventoryWrite } from "@/lib/admin/scoreboardRemotes/access";
import {
  REMOTE_ALREADY_OUT,
  REMOTE_NOT_AVAILABLE,
  checkoutAfterControllerStatus,
  decideCheckInAccess,
  decideScoreboardCheckIn,
  decideScoreboardCheckout,
  statusClosesOpenCheckout,
} from "@/lib/admin/scoreboardRemotes/checkoutRules";
import { legacyRemoteHoldKey, scoreboardFieldHoldKey } from "@/lib/admin/scoreboardRemotes/fieldKey";
import {
  ADD_REMOTES_MESSAGE,
  buildRemoteTabGames,
  remotesAvailableForCheckout,
  type RemoteControllerRecord,
  type RemoteOpenCheckoutRecord,
  type RemoteTabGameInput,
} from "@/lib/admin/scoreboardRemotes/present";

const active = (id: string, venueId = "stevens"): RemoteControllerRecord => ({
  id,
  venueId,
  label: id === "retired" ? "Old remote" : `Stevens #${id}`,
  homeFieldName: id === "home" ? "Field #3" : null,
  status: "ACTIVE",
});

describe("scoreboard remote checkout rules", () => {
  it("refuses a second open checkout of the same remote", () => {
    const taken = decideScoreboardCheckout({
      writeAllowed: true,
      gameVenueId: "stevens",
      venueRemoteCount: 2,
      gameHasOpenCheckout: false,
      controller: { id: "3", venueId: "stevens", status: "ACTIVE" },
      controllerHasOpenCheckout: true,
      volunteerName: "Ada Blue",
      side: "home",
    });
    assert.equal(taken.ok, false);
    if (!taken.ok) assert.equal(taken.error, REMOTE_ALREADY_OUT);

    const free = decideScoreboardCheckout({
      writeAllowed: true,
      gameVenueId: "stevens",
      venueRemoteCount: 2,
      gameHasOpenCheckout: false,
      controller: { id: "3", venueId: "stevens", status: "ACTIVE" },
      controllerHasOpenCheckout: false,
      volunteerName: "Ada Blue",
      side: "away",
    });
    assert.equal(free.ok, true);
    if (free.ok) {
      assert.equal(free.side, "AWAY");
      assert.equal(free.volunteerName, "Ada Blue");
    }
  });

  it("hides retired remotes and keeps missing or repair remotes off check-out", () => {
    const available = remotesAvailableForCheckout(
      [
        active("1"),
        { ...active("retired"), status: "RETIRED" },
        { ...active("2"), status: "ACTIVE" },
        { ...active("repair"), status: "REPAIR" },
        { ...active("missing"), status: "MISSING" },
      ],
      new Set(["2"]),
    );
    assert.deepEqual(
      available.map((remote) => remote.id),
      ["1"],
    );

    const retired = decideScoreboardCheckout({
      writeAllowed: true,
      gameVenueId: "stevens",
      venueRemoteCount: 1,
      gameHasOpenCheckout: false,
      controller: { id: "retired", venueId: "stevens", status: "RETIRED" },
      controllerHasOpenCheckout: false,
      volunteerName: "Ada Blue",
      side: "home",
    });
    assert.equal(retired.ok, false);
    if (!retired.ok) assert.equal(retired.error, REMOTE_NOT_AVAILABLE);
  });

  it("checks a draft or canceled game back in for an authorized user and refuses an unauthorized one", () => {
    for (const gameStatus of ["DRAFT", "CANCELED"] as const) {
      assert.equal(
        decideCheckInAccess({
          gameStatus,
          gameWriteAllowed: true,
          inventoryWriteAllowed: false,
        }).allowed,
        true,
      );
      assert.equal(
        decideCheckInAccess({
          gameStatus,
          gameWriteAllowed: false,
          inventoryWriteAllowed: false,
        }).allowed,
        false,
      );
      const denied = decideScoreboardCheckIn({
        writeAllowed: false,
        checkout: { checkedInAt: null },
      });
      assert.equal(denied.ok, false);
    }

    const posted = decideCheckInAccess({
      gameStatus: "LOCKED",
      gameWriteAllowed: false,
      inventoryWriteAllowed: true,
    });
    assert.equal(posted.allowed, false);

    const unpostedAtVenue = decideCheckInAccess({
      gameStatus: "CANCELED",
      gameWriteAllowed: false,
      inventoryWriteAllowed: true,
    });
    assert.equal(unpostedAtVenue.allowed, true);

    const missingGame = decideCheckInAccess({
      gameStatus: null,
      gameWriteAllowed: false,
      inventoryWriteAllowed: true,
    });
    assert.equal(missingGame.allowed, true);
  });

  it("closes the open checkout when a remote is marked missing so it is no longer held", () => {
    assert.equal(statusClosesOpenCheckout("MISSING"), true);
    assert.equal(statusClosesOpenCheckout("REPAIR"), true);
    assert.equal(statusClosesOpenCheckout("RETIRED"), true);
    assert.equal(statusClosesOpenCheckout("ACTIVE"), false);

    const checkedInAt = new Date("2026-10-08T23:00:00.000Z");
    const closed = checkoutAfterControllerStatus(
      "MISSING",
      { controllerId: "3", checkedInAt: null as Date | null },
      checkedInAt,
    );
    assert.equal(closed.checkedInAt, checkedInAt);
    const stillOut = checkoutAfterControllerStatus("ACTIVE", { controllerId: "3", checkedInAt: null }, checkedInAt);
    assert.equal(stillOut.checkedInAt, null);

    const openControllerIds = new Set(closed.checkedInAt ? [] : [closed.controllerId]);
    assert.deepEqual(
      remotesAvailableForCheckout([active("3")], openControllerIds).map((remote) => remote.id),
      ["3"],
    );
  });
});

describe("scoreboard remote access", () => {
  it("lets a director manage only an assigned venue", () => {
    assert.equal(
      decideRemoteInventoryWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        venueId: "stevens",
        leagueVenueIds: ["stevens", "paula"],
        assignedVenueIds: ["stevens"],
      }).allowed,
      true,
    );
    const other = decideRemoteInventoryWrite({
      isMaster: false,
      role: "PARK_DIRECTOR",
      venueId: "paula",
      leagueVenueIds: ["stevens", "paula"],
      assignedVenueIds: ["stevens"],
    });
    assert.equal(other.allowed, false);
    assert.equal(other.reason, "other_venue");
    const none = decideRemoteInventoryWrite({
      isMaster: false,
      role: "PARK_DIRECTOR",
      venueId: "stevens",
      leagueVenueIds: ["stevens"],
      assignedVenueIds: [],
    });
    assert.equal(none.allowed, false);
    assert.equal(none.reason, "unassigned_director");
  });

  it("lets a league admin manage linked venues and a master manage every park", () => {
    assert.equal(
      decideRemoteInventoryWrite({
        isMaster: false,
        role: "ADMIN",
        venueId: "stevens",
        leagueVenueIds: ["stevens"],
        assignedVenueIds: [],
      }).reason,
      "league",
    );
    assert.equal(
      decideRemoteInventoryWrite({
        isMaster: false,
        role: "ADMIN",
        venueId: "paula",
        leagueVenueIds: ["stevens"],
        assignedVenueIds: [],
      }).allowed,
      false,
    );
    assert.equal(
      decideRemoteInventoryWrite({
        isMaster: true,
        role: "ADMIN",
        venueId: "paula",
        leagueVenueIds: [],
        assignedVenueIds: [],
      }).reason,
      "all",
    );
    assert.equal(
      decideRemoteInventoryWrite({
        isMaster: false,
        role: "BOARD_MEMBER",
        venueId: "stevens",
        leagueVenueIds: ["stevens"],
        assignedVenueIds: [],
      }).reason,
      "read_only",
    );
  });

  it("denies a cross-league checkout unless the venue is assigned", () => {
    const denied = decideParkDirectorGameWrite({
      isMaster: false,
      role: "ADMIN",
      activeVenueIds: [],
      park: { venueId: "stevens" },
      roleOnGameLeague: false,
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, "other_venue");
    const checkout = decideScoreboardCheckout({
      writeAllowed: denied.allowed,
      gameVenueId: "stevens",
      venueRemoteCount: 1,
      gameHasOpenCheckout: false,
      controller: { id: "3", venueId: "stevens", status: "ACTIVE" },
      controllerHasOpenCheckout: false,
      volunteerName: "Ada Blue",
      side: "home",
    });
    assert.equal(checkout.ok, false);

    const director = decideParkDirectorGameWrite({
      isMaster: false,
      role: "PARK_DIRECTOR",
      activeVenueIds: ["stevens"],
      park: { venueId: "paula" },
      roleOnGameLeague: false,
    });
    assert.equal(director.allowed, false);
    assert.equal(director.reason, "other_venue");

    const assigned = decideParkDirectorGameWrite({
      isMaster: false,
      role: "PARK_DIRECTOR",
      activeVenueIds: ["stevens"],
      park: { venueId: "stevens" },
      roleOnGameLeague: false,
    });
    assert.equal(assigned.allowed, true);
    assert.equal(assigned.reason, "assigned_venue");
  });
});

describe("scoreboard remote field holds", () => {
  it("keys a hold on the venue and the normalized field name", () => {
    assert.equal(scoreboardFieldHoldKey("stevens", "Field #3"), scoreboardFieldHoldKey("stevens", "field 3"));
    assert.notEqual(scoreboardFieldHoldKey("stevens", "Field 3"), scoreboardFieldHoldKey("paula", "Field 3"));
    assert.equal(scoreboardFieldHoldKey(null, "Field 3"), null);
    assert.equal(legacyRemoteHoldKey(null, "Stevens Park", "Field #3"), legacyRemoteHoldKey(null, "stevens park", "field 3"));
    assert.notEqual(legacyRemoteHoldKey(null, "Stevens", "Field 3"), legacyRemoteHoldKey(null, "Paula", "Field 3"));
  });

  it("shows a remote still out on the same field in another league", () => {
    const gonzales = game({ id: "g", organizationId: "gonzales", fieldName: "Field #3" });
    const fall = game({ id: "f", organizationId: "fallball", fieldName: "Field 3" });
    const otherField = game({ id: "o", organizationId: "fallball", fieldName: "Field 1" });
    const rows = buildRemoteTabGames({
      games: [gonzales, fall, otherField],
      controllers: [active("3", "stevens"), { ...active("retired"), id: "old", status: "RETIRED", venueId: "stevens" }],
      openCheckouts: [
        checkout({
          id: "out",
          controllerId: "3",
          scheduleDraftGameId: "g",
          fieldName: "Field #3",
        }),
      ],
    });
    assert.equal(rows[0]?.openCheckouts[0]?.label, "Stevens #3");
    assert.equal(rows[0]?.openCheckouts[0]?.volunteerName, "Ada Blue");
    assert.equal(rows[1]?.holds[0]?.label, "Stevens #3");
    assert.equal(rows[1]?.holds[0]?.volunteer, "Ada Blue");
    assert.equal(rows[2]?.holds.length, 0);
    assert.deepEqual(
      rows[1]?.availableRemotes.map((remote) => remote.id),
      [],
    );
    assert.equal(rows[0]?.availableRemotes.some((remote) => remote.id === "old"), false);
  });

  it("keeps the old checkout text read-only when the park has no remotes", () => {
    const unlinked = buildRemoteTabGames({
      games: [game({ id: "u", venueId: null, legacyCheckout: { status: "out", side: "home", team: "Home", name: "Ada Blue", note: "Out since 6:00 PM" } })],
      controllers: [],
      openCheckouts: [],
    });
    assert.equal(unlinked[0]?.mode, "legacy");
    assert.equal(unlinked[0]?.legacyMessage, ADD_REMOTES_MESSAGE);
    assert.equal(unlinked[0]?.legacyCheckout?.name, "Ada Blue");
    assert.deepEqual(unlinked[0]?.openCheckouts, []);

    const emptyVenue = buildRemoteTabGames({
      games: [game({ id: "e" })],
      controllers: [],
      openCheckouts: [],
    });
    assert.equal(emptyVenue[0]?.mode, "legacy");
    assert.equal(emptyVenue[0]?.legacyMessage, ADD_REMOTES_MESSAGE);
  });

  it("keeps a legacy hold when the park is not linked to a venue", () => {
    const out = game({
      id: "a",
      venueId: null,
      parkName: "Stevens",
      fieldName: "Field #3",
      legacyCheckout: { status: "out", side: "home", team: "Home", name: "Ada Blue", note: "Out since 6:00 PM" },
    });
    const waiting = game({
      id: "b",
      venueId: null,
      parkName: "Stevens",
      fieldName: "Field 3",
      organizationId: "gonzales",
    });
    const otherPark = game({
      id: "c",
      venueId: null,
      parkName: "Paula",
      fieldName: "Field 3",
    });
    const rows = buildRemoteTabGames({
      games: [out, waiting, otherPark],
      controllers: [],
      openCheckouts: [],
    });
    assert.equal(rows[1]?.holds[0]?.volunteer, "Ada Blue");
    assert.equal(rows[0]?.holds.length, 0);
    assert.equal(rows[2]?.holds.length, 0);
  });
});

function game(overrides: Partial<RemoteTabGameInput> & { id: string }): RemoteTabGameInput {
  return {
    organizationId: "fallball",
    when: "Wed, Oct 8 · 6:00 PM",
    division: "10U",
    homeTeam: "Home",
    awayTeam: "Away",
    parkName: "Stevens",
    fieldName: "Field 3",
    venueId: "stevens",
    leagueLabel: "Fall Ball",
    leaguePrimaryHex: "#111827",
    badgeText: "#ffffff",
    isToday: true,
    legacyCheckout: { status: "in", side: null, team: null, name: null, note: null },
    ...overrides,
  };
}

function checkout(overrides: Partial<RemoteOpenCheckoutRecord> & { id: string }): RemoteOpenCheckoutRecord {
  return {
    controllerId: "3",
    controllerLabel: "Stevens #3",
    venueId: "stevens",
    scheduleDraftGameId: "g",
    fieldName: "Field 3",
    side: "HOME",
    volunteerName: "Ada Blue",
    whenLabel: "Wed, Oct 8 · 6:00 PM",
    matchup: "Away at Home",
    ...overrides,
  };
}
