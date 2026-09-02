import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getLiveContentOrgs,
  getPrimaryLiveContentOrg,
  isSeasonLiveForOrg,
  leagueCalendarDate,
} from "../seasonConfig";

function utcNoonOn(isoDate: string): Date {
  return new Date(`${isoDate}T17:00:00.000Z`);
}

describe("seasonConfig live org", () => {
  it("formats the league calendar date in America/Chicago", () => {
    assert.equal(leagueCalendarDate(utcNoonOn("2026-09-02")), "2026-09-02");
  });

  it("treats Fall Ball as the only live org in September 2026", () => {
    const asOf = utcNoonOn("2026-09-02");
    assert.equal(isSeasonLiveForOrg("fallball", asOf), true);
    assert.equal(isSeasonLiveForOrg("gonzales", asOf), false);
    assert.equal(isSeasonLiveForOrg("ascension", asOf), false);
    assert.deepEqual(getLiveContentOrgs(asOf), ["fallball"]);
    assert.equal(getPrimaryLiveContentOrg(asOf), "fallball");
  });

  it("returns both spring orgs as live in April 2026, landing on gonzales", () => {
    const asOf = utcNoonOn("2026-04-15");
    assert.deepEqual(getLiveContentOrgs(asOf), ["gonzales", "ascension"]);
    assert.equal(getPrimaryLiveContentOrg(asOf), "gonzales");
  });

  it("picks the next upcoming season when none are live (July 2026 → fallball)", () => {
    const asOf = utcNoonOn("2026-07-15");
    assert.deepEqual(getLiveContentOrgs(asOf), []);
    assert.equal(getPrimaryLiveContentOrg(asOf), "fallball");
  });

  it("picks the most recently ended season after every window (December 2026 → fallball)", () => {
    const asOf = utcNoonOn("2026-12-15");
    assert.deepEqual(getLiveContentOrgs(asOf), []);
    assert.equal(getPrimaryLiveContentOrg(asOf), "fallball");
  });
});
