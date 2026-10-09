import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  classifyParksDirectorsRemotes,
  divisionAgesConfirmedStatus,
  isManualChecklistItemKey,
  MANUAL_CHECKLIST_ITEM_KEYS,
  type ParkReadinessDirector,
  type ParkReadinessPark,
  type ParkReadinessRemote,
  type ParkReadinessVenue,
} from "@/lib/admin/seasonSetup/checklistStatus";

const venue: ParkReadinessVenue = { id: "venue-1", isActive: true };
const directorOne: ParkReadinessDirector = { venueId: "venue-1", active: true };
const activeRemote: ParkReadinessRemote = { venueId: "venue-1", status: "ACTIVE" };

function park(name: string, overrides: Partial<ParkReadinessPark> = {}): ParkReadinessPark {
  return { name, isActive: true, venueId: null, ...overrides };
}

describe("division ages checklist step", () => {
  it("is complete only when a saved table is stored", () => {
    assert.equal(divisionAgesConfirmedStatus({ divisions: [{ code: "10U" }] }), "COMPLETE");
    assert.equal(divisionAgesConfirmedStatus([{ code: "10U" }]), "COMPLETE");
    assert.equal(divisionAgesConfirmedStatus(null), "INCOMPLETE");
    assert.equal(divisionAgesConfirmedStatus(undefined), "INCOMPLETE");
    assert.equal(divisionAgesConfirmedStatus("10U"), "INCOMPLETE");
  });
});

describe("parks, directors, and remotes", () => {
  it("stays incomplete when the park is not linked", () => {
    const result = classifyParksDirectorsRemotes({
      parks: [park("Park A")],
      venues: [venue],
      directors: [directorOne],
      remotes: [activeRemote],
    });
    assert.equal(result.status, "INCOMPLETE");
    assert.equal(result.progressLabel, "0/1 parks ready");
    assert.deepEqual(result.subItems, [{ label: "Park A", status: "INCOMPLETE" }]);
  });

  it("stays short of complete when the park is linked and has no director", () => {
    const result = classifyParksDirectorsRemotes({
      parks: [park("Park A", { venueId: "venue-1" })],
      venues: [venue],
      directors: [{ venueId: "venue-1", active: false }],
      remotes: [],
    });
    assert.equal(result.status, "PARTIAL");
    assert.equal(result.progressLabel, "0/1 parks ready");
    assert.equal(result.subItems[0]?.status, "INCOMPLETE");
  });

  it("does not count a retired, missing, or repair remote", () => {
    for (const status of ["RETIRED", "MISSING", "REPAIR"]) {
      const result = classifyParksDirectorsRemotes({
        parks: [park("Park A", { venueId: "venue-1" })],
        venues: [venue],
        directors: [directorOne],
        remotes: [{ venueId: "venue-1", status }],
      });
      assert.equal(result.status, "PARTIAL", status);
      assert.equal(result.subItems[0]?.status, "INCOMPLETE", status);
    }
  });

  it("is complete when the park, director, and active remote are all present", () => {
    const result = classifyParksDirectorsRemotes({
      parks: [park("Park A", { venueId: "venue-1" })],
      venues: [venue],
      directors: [directorOne],
      remotes: [activeRemote],
    });
    assert.equal(result.status, "COMPLETE");
    assert.equal(result.progressLabel, "1/1 parks ready");
    assert.deepEqual(result.subItems, [{ label: "Park A", status: "COMPLETE" }]);
  });

  it("ignores an inactive park", () => {
    const result = classifyParksDirectorsRemotes({
      parks: [
        park("Closed Park", { isActive: false, venueId: null }),
        park("Park A", { venueId: "venue-1" }),
      ],
      venues: [venue],
      directors: [directorOne],
      remotes: [activeRemote],
    });
    assert.equal(result.status, "COMPLETE");
    assert.equal(result.progressLabel, "1/1 parks ready");
    assert.deepEqual(result.subItems, [{ label: "Park A", status: "COMPLETE" }]);

    const none = classifyParksDirectorsRemotes({
      parks: [park("Closed Park", { isActive: false })],
      venues: [],
      directors: [],
      remotes: [],
    });
    assert.equal(none.status, "INCOMPLETE");
    assert.equal(none.progressLabel, undefined);
    assert.deepEqual(none.subItems, []);
  });

  it("lets one shared venue complete the park", () => {
    const result = classifyParksDirectorsRemotes({
      parks: [
        park("Park A", { venueId: "venue-1" }),
        park("Park B", { venueId: "venue-1" }),
      ],
      venues: [venue],
      directors: [directorOne],
      remotes: [activeRemote],
    });
    assert.equal(result.status, "COMPLETE");
    assert.equal(result.progressLabel, "2/2 parks ready");
    assert.deepEqual(
      result.subItems.map((item) => item.status),
      ["COMPLETE", "COMPLETE"],
    );
  });

  it("counts only the parks that are ready", () => {
    const result = classifyParksDirectorsRemotes({
      parks: [
        park("Park A", { venueId: "venue-1" }),
        park("Park B", { venueId: "venue-1" }),
        park("Park C"),
        park("Park D"),
      ],
      venues: [venue],
      directors: [directorOne],
      remotes: [activeRemote],
    });
    assert.equal(result.status, "PARTIAL");
    assert.equal(result.progressLabel, "2/4 parks ready");
  });
});

describe("manual checklist keys", () => {
  it("rejects the computed season setup keys", () => {
    assert.deepEqual(MANUAL_CHECKLIST_ITEM_KEYS, [
      "REGISTRATION_WINDOW_SET",
      "JERSEY_ORDERS_SUBMITTED",
    ]);
    assert.equal(isManualChecklistItemKey("REGISTRATION_WINDOW_SET"), true);
    assert.equal(isManualChecklistItemKey("JERSEY_ORDERS_SUBMITTED"), true);
    assert.equal(isManualChecklistItemKey("DIVISION_AGES_CONFIRMED"), false);
    assert.equal(isManualChecklistItemKey("PARKS_DIRECTORS_REMOTES"), false);
    assert.equal(isManualChecklistItemKey("SCHEDULE_PUBLISHED"), false);
  });

  it("keeps the new steps out of the manual post and in checklist order", () => {
    const checklist = readFileSync(new URL("../checklist.ts", import.meta.url), "utf8");
    const keys = [...checklist.matchAll(/key: "([A-Z0-9_]+)"/g)].map((match) => match[1]);
    assert.deepEqual(keys, [
      "DIVISION_AGES_CONFIRMED",
      "REGISTRATION_WINDOW_SET",
      "REGISTRATION_DATA_IMPORTED",
      "COACHING_INTEREST_FOLLOWED_UP",
      "COACHES_SYNCED",
      "VOLUNTEER_COMPLIANCE_CURRENT",
      "ROSTERS_BUILT",
      "JERSEY_ORDERS_SUBMITTED",
      "PARKS_DIRECTORS_REMOTES",
      "SCHEDULE_PUBLISHED",
    ]);
    assert.match(checklist, /isMasterDeployment\(\) \? "\/admin\/parks" : "\/admin\/game-day\/remotes"/);
    assert.match(checklist, /divisionAgesConfirmedStatus/);
    assert.match(checklist, /classifyParksDirectorsRemotes/);

    const route = readFileSync(
      new URL("../../../../app/api/admin/season-setup/route.ts", import.meta.url),
      "utf8",
    );
    const post = route.slice(route.indexOf("export async function POST"));
    assert.ok(post.indexOf("isManualChecklistItemKey") < post.indexOf("seasonSetupChecklistItem"));
  });
});
