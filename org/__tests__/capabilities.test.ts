import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOrgCapabilities,
  isAdminModuleEnabledInCapabilities,
  isCoachingInterestEnabled,
  isPublicNavEnabledInCapabilities,
  requiresExplicitAssignrLeague,
} from "../capabilities";
import {
  getSeasonConfigForOrg,
  CURRENT_SEASON_LABEL,
} from "../../seasonConfig";

describe("fallball capabilities (Phase 3 smoke)", () => {
  it("uses compact-ops homepage and SportsConnect registration", () => {
    const caps = getOrgCapabilities("fallball");
    assert.equal(caps.homepage, "compact-ops");
    assert.equal(caps.registration, "sportsconnect");
    assert.equal(caps.schedule, "assignr");
    assert.equal(caps.allStar, false);
    assert.equal(caps.tournaments, false);
    assert.equal(caps.coachingInterest, true);
    assert.equal(caps.teamNameMode, "mlb");
  });

  it("enables coaching interest only for fallball by default", () => {
    assert.equal(isCoachingInterestEnabled("fallball"), true);
    assert.equal(isCoachingInterestEnabled("gonzales"), false);
    assert.equal(isCoachingInterestEnabled("ascension"), false);
    assert.equal(isCoachingInterestEnabled(null), false);
  });

  it("disables tournament/all-star admin modules and public nav", () => {
    assert.equal(isAdminModuleEnabledInCapabilities("fallball", "TOURNAMENT_BRACKETS"), false);
    assert.equal(isAdminModuleEnabledInCapabilities("fallball", "SPONSORS"), false);
    assert.equal(isPublicNavEnabledInCapabilities("fallball", "tournaments"), false);
    assert.equal(isPublicNavEnabledInCapabilities("fallball", "all-stars"), false);
  });

  it("requires explicit Assignr league (no Gonzales fallback)", () => {
    assert.equal(requiresExplicitAssignrLeague("fallball"), true);
    assert.equal(requiresExplicitAssignrLeague("gonzales"), false);
  });
});

describe("org-aware season config", () => {
  it("fallball season is Fall Ball 2026", () => {
    const s = getSeasonConfigForOrg("fallball");
    assert.equal(s.label, "Fall Ball 2026");
    assert.equal(s.year, 2026);
    assert.ok(s.startDate.startsWith("2026-08"));
  });

  it("gonzales season remains Spring 2026", () => {
    const s = getSeasonConfigForOrg("gonzales");
    assert.equal(s.label, "Spring 2026");
  });
});

describe("deploy season constant", () => {
  it("exports a non-empty CURRENT_SEASON_LABEL", () => {
    assert.ok(typeof CURRENT_SEASON_LABEL === "string");
    assert.ok(CURRENT_SEASON_LABEL.length > 0);
  });
});
