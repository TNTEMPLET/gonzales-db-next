import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toPublicPlayerCard } from "../privacy";
import type { PlayerCardView } from "../types";

function sampleCard(overrides: Partial<PlayerCardView> = {}): PlayerCardView {
  return {
    id: "p1",
    organizationId: "gonzales",
    seasonYear: 2026,
    readiness: "READY",
    checks: [],
    completeCount: 8,
    totalRequired: 8,
    firstName: "Kid",
    lastName: "Player",
    fullName: "Kid Player",
    jerseyNumber: "7",
    jerseySize: "YM",
    rosterStatus: "ACTIVE",
    birthDate: null,
    gender: null,
    allStarAgeBand: null,
    guardianFirstName: "Pat",
    guardianLastName: "Parent",
    guardianEmail: "pat@example.com",
    guardianPhone: "555",
    contactPhone: null,
    paymentStatus: "PAID",
    birthCertificateStatus: "ON_FILE",
    registrationOrderNo: null,
    registrationOrderDate: null,
    streetAddress: "123 Main",
    unit: null,
    city: "Gonzales",
    state: "LA",
    postalCode: "70737",
    medicalConditionsSummary: "Allergy",
    medicalConditionsDetails: "Peanuts",
    medicalTreatmentAuthorized: true,
    liabilityWaiverAccepted: true,
    codeOfConductAccepted: true,
    refundPolicyAccepted: true,
    team: {
      id: "t1",
      teamName: "Tigers",
      ageGroup: "10U",
      seasonYear: 2026,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("toPublicPlayerCard", () => {
  it("admin keeps medical details", () => {
    const card = toPublicPlayerCard(sampleCard(), "ADMIN");
    assert.equal(card.medicalConditionsDetails, "Peanuts");
    assert.equal(card.streetAddress, "123 Main");
  });

  it("coach hides medical details only", () => {
    const card = toPublicPlayerCard(sampleCard(), "COACH");
    assert.equal(card.medicalConditionsDetails, null);
    assert.equal(card.medicalConditionsSummary, "Allergy");
    assert.equal(card.streetAddress, "123 Main");
  });

  it("guardian hides address and medical", () => {
    const card = toPublicPlayerCard(sampleCard(), "GUARDIAN");
    assert.equal(card.streetAddress, null);
    assert.equal(card.postalCode, null);
    assert.equal(card.medicalConditionsSummary, null);
    assert.equal(card.medicalConditionsDetails, null);
    assert.equal(card.fullName, "Kid Player");
  });
});
