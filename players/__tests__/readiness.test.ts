import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildPlayerChecks,
  computePlayerReadiness,
  hasGuardianContact,
  isBirthCertificateSatisfied,
  isPaymentSatisfied,
  isRosterBlocked,
} from "../readiness";
import { getPlayerProfileCompleteness } from "../completeness";

const fullReady = {
  guardianEmail: "parent@example.com",
  paymentStatus: "PAID",
  birthCertificateStatus: "ON_FILE",
  liabilityWaiverAccepted: true,
  codeOfConductAccepted: true,
  refundPolicyAccepted: true,
  medicalTreatmentAuthorized: true,
  rosterStatus: "ACTIVE",
};

describe("isPaymentSatisfied", () => {
  it("accepts known paid tokens", () => {
    assert.equal(isPaymentSatisfied("PAID"), true);
    assert.equal(isPaymentSatisfied("paid in full"), true);
    assert.equal(isPaymentSatisfied("Complete"), true);
    assert.equal(isPaymentSatisfied(""), false);
    assert.equal(isPaymentSatisfied("PENDING"), false);
  });
});

describe("isBirthCertificateSatisfied", () => {
  it("accepts on-file style values", () => {
    assert.equal(isBirthCertificateSatisfied("ON_FILE"), true);
    assert.equal(isBirthCertificateSatisfied("on file"), true);
    assert.equal(isBirthCertificateSatisfied("Verified"), true);
    assert.equal(isBirthCertificateSatisfied(null), false);
  });
});

describe("hasGuardianContact", () => {
  it("accepts email, guardian phone, or player phone", () => {
    assert.equal(hasGuardianContact({ guardianEmail: "a@b.c" }), true);
    assert.equal(hasGuardianContact({ guardianPhone: "555" }), true);
    assert.equal(hasGuardianContact({ contactPhone: "555" }), true);
    assert.equal(hasGuardianContact({}), false);
  });
});

describe("computePlayerReadiness", () => {
  it("returns READY when all checks pass", () => {
    assert.equal(computePlayerReadiness(fullReady), "READY");
  });

  it("returns INCOMPLETE when payment missing", () => {
    assert.equal(
      computePlayerReadiness({ ...fullReady, paymentStatus: null }),
      "INCOMPLETE",
    );
  });

  it("returns BLOCKED when roster is dropped", () => {
    assert.equal(isRosterBlocked("DROPPED"), true);
    assert.equal(
      computePlayerReadiness({ ...fullReady, rosterStatus: "DROPPED" }),
      "BLOCKED",
    );
  });

  it("returns INCOMPLETE when waivers missing", () => {
    assert.equal(
      computePlayerReadiness({
        ...fullReady,
        liabilityWaiverAccepted: false,
        codeOfConductAccepted: false,
      }),
      "INCOMPLETE",
    );
  });
});

describe("buildPlayerChecks", () => {
  it("builds eight required checks", () => {
    const checks = buildPlayerChecks(fullReady);
    assert.equal(checks.length, 8);
    assert.ok(checks.every((c) => c.required));
    assert.ok(checks.every((c) => c.ok));
  });
});

describe("getPlayerProfileCompleteness", () => {
  it("scores complete vs incomplete", () => {
    const ready = getPlayerProfileCompleteness(fullReady);
    assert.equal(ready.isComplete, true);
    assert.equal(ready.readiness, "READY");
    assert.equal(ready.completeCount, ready.total);

    const incomplete = getPlayerProfileCompleteness({
      ...fullReady,
      guardianEmail: null,
      guardianPhone: null,
      contactPhone: null,
    });
    assert.equal(incomplete.isComplete, false);
    assert.ok(incomplete.missingLabels.includes("Guardian contact"));
  });
});
