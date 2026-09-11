import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDivisionAudienceRules,
  dedupeRecipientsByEmail,
  formatAudienceSummary,
  logicalModeForRules,
  mapDivisionCoachRows,
  mapDivisionParentRows,
  normalizeAgeGroups,
  summarizeDivisionAudience,
} from "@/lib/communications/divisionAudience";
import type { AudienceRecipient } from "@/lib/communications/types";

function coach(
  id: string,
  email: string,
  ageGroup: string,
): AudienceRecipient {
  return mapDivisionCoachRows(
    [
      {
        team: { ageGroup, organizationId: "fallball" },
        registeredUser: { id, email, contactPhone: null },
      },
    ],
    { organizationId: "fallball" },
  )[0];
}

describe("division audience helpers", () => {
  it("normalizes age groups and builds coach/parent union rules", () => {
    assert.deepEqual(normalizeAgeGroups([" 8U CP ", "9U", "8U CP", ""]), ["8U CP", "9U"]);
    const rules = buildDivisionAudienceRules({
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroups: ["8U CP", "9U"],
      includeCoaches: true,
      includeParents: true,
    });
    assert.equal(logicalModeForRules(rules), "OR");
    assert.equal(rules.length, 2);
    assert.equal(rules[0].ruleType, "DIVISION_COACHES");
    assert.equal(rules[1].ruleType, "DIVISION_PARENTS");
    assert.deepEqual(rules[0].ageGroups, ["8U CP", "9U"]);
    assert.equal(rules[0].seasonYear, 2026);
  });

  it("builds coaches-only or parents-only rules", () => {
    const coaches = buildDivisionAudienceRules({
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroups: ["8U CP"],
      includeCoaches: true,
      includeParents: false,
    });
    assert.deepEqual(
      coaches.map((rule) => rule.ruleType),
      ["DIVISION_COACHES"],
    );
    const parents = buildDivisionAudienceRules({
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroups: ["8U CP", "9U"],
      includeCoaches: false,
      includeParents: true,
    });
    assert.deepEqual(
      parents.map((rule) => rule.ruleType),
      ["DIVISION_PARENTS"],
    );
    assert.deepEqual(parents[0].ageGroups, ["8U CP", "9U"]);
  });

  it("skips blank guardian emails and maps parent rows", () => {
    const mapped = mapDivisionParentRows(
      [
        {
          id: "e1",
          organizationId: "fallball",
          ageGroup: "8U CP",
          guardianEmail: " parent@example.com ",
          guardianFirstName: "Pat",
          guardianLastName: "Parent",
        },
        {
          id: "e2",
          organizationId: "fallball",
          ageGroup: "8U CP",
          guardianEmail: "  ",
          guardianFirstName: "No",
          guardianLastName: "Email",
        },
        {
          id: "e3",
          organizationId: "fallball",
          ageGroup: "9U",
          guardianEmail: null,
          guardianFirstName: null,
          guardianLastName: null,
        },
      ],
      { organizationId: "fallball" },
    );
    assert.equal(mapped.length, 1);
    assert.equal(mapped[0].email, "parent@example.com");
    assert.equal(mapped[0].contactName, "Pat Parent");
    assert.equal(mapped[0].sourceType, "ENROLLMENT_GUARDIAN");
    assert.deepEqual(mapped[0].matchReasons, ["DIVISION_PARENTS:8U CP"]);
  });

  it("dedupes the same email across coaches and parents", () => {
    const coachRow = coach("u1", "sam@example.com", "8U CP");
    const parentRow = mapDivisionParentRows(
      [
        {
          id: "e1",
          organizationId: "fallball",
          ageGroup: "9U",
          guardianEmail: "SAM@example.com",
          guardianFirstName: "Sam",
          guardianLastName: "Smith",
        },
      ],
      { organizationId: "fallball" },
    )[0];
    const otherParent = mapDivisionParentRows(
      [
        {
          id: "e2",
          organizationId: "fallball",
          ageGroup: "8U CP",
          guardianEmail: "other@example.com",
          guardianFirstName: "Other",
          guardianLastName: "Parent",
        },
      ],
      { organizationId: "fallball" },
    )[0];

    const deduped = dedupeRecipientsByEmail([parentRow, coachRow, otherParent]);
    assert.equal(deduped.length, 2);
    const sam = deduped.find((row) => row.email?.toLowerCase() === "sam@example.com");
    assert.ok(sam);
    assert.equal(sam.recipientType, "REGISTERED_USER");
    assert.equal(sam.registeredUserId, "u1");
    assert.ok(sam.matchReasons.includes("DIVISION_COACHES:8U CP"));
    assert.ok(sam.matchReasons.includes("DIVISION_PARENTS:9U"));
  });

  it("summarizes two-division coach+parent audience", () => {
    const rules = buildDivisionAudienceRules({
      organizationId: "fallball",
      seasonYear: 2026,
      ageGroups: ["8U CP", "9U"],
      includeCoaches: true,
      includeParents: true,
    });
    const summary = summarizeDivisionAudience(rules);
    assert.deepEqual(summary, {
      ageGroups: ["8U CP", "9U"],
      includeCoaches: true,
      includeParents: true,
      seasonYear: 2026,
    });
    assert.equal(formatAudienceSummary(rules), "8U CP, 9U · Coaches + Parents");
  });
});
