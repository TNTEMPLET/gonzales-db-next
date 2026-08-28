import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateAccessBadgeEligibility } from "../accessBadge";
import type { VolunteerCardView } from "../types";

function baseCard(
  readiness: VolunteerCardView["readiness"],
): VolunteerCardView {
  return {
    id: "vpc_test_1",
    organizationId: "fallball",
    seasonYear: 2026,
    status: "ACTIVE",
    notes: null,
    aMark: false,
    readiness,
    roles: [],
    requirements: [],
    registeredUser: {
      id: "u1",
      email: "coach@example.com",
      name: "Test Coach",
      firstName: "Test",
      lastName: "Coach",
      contactPhone: null,
      isCoach: true,
      ageGroup: null,
      assignedTeam: null,
    },
    teamAssignments: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("evaluateAccessBadgeEligibility", () => {
  it("allows event access only when READY", () => {
    const ready = evaluateAccessBadgeEligibility(baseCard("READY"));
    assert.equal(ready.eligibleForEventAccess, true);
    assert.equal(ready.publicBadgeSubject, "vpc_vpc_test_1");

    for (const r of ["INCOMPLETE", "EXPIRED", "BLOCKED"] as const) {
      const e = evaluateAccessBadgeEligibility(baseCard(r));
      assert.equal(e.eligibleForEventAccess, false);
    }
  });
});
