/**
 * Pure player-card readiness — shared by admin, coach, and future parent portal.
 */
import {
  PLAYER_CHECK_KEYS,
  PLAYER_CHECK_LABELS,
  type PlayerCardFields,
  type PlayerCheckKey,
  type PlayerCheckView,
  type PlayerReadiness,
} from "./types";

/** Payment values treated as satisfied (case-insensitive). */
const PAYMENT_OK = new Set([
  "PAID",
  "COMPLETE",
  "COMPLETED",
  "CLEAR",
  "FULL",
  "YES",
  "Y",
  "DONE",
  "RECEIVED",
]);

/** Birth-certificate values treated as satisfied. */
const BIRTH_CERT_OK = new Set([
  "CLEAR",
  "COMPLETE",
  "COMPLETED",
  "ON_FILE",
  "ON FILE",
  "RECEIVED",
  "VERIFIED",
  "YES",
  "Y",
  "DONE",
  "APPROVED",
]);

/** Roster statuses that block readiness. */
const ROSTER_BLOCKED = new Set([
  "DROPPED",
  "INACTIVE",
  "REMOVED",
  "WITHDRAWN",
  "CUT",
]);

function normalizeToken(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase().replace(/[_-]+/g, " ");
}

export function isPaymentSatisfied(status: string | null | undefined): boolean {
  const raw = (status || "").trim();
  if (!raw) return false;
  const token = normalizeToken(raw);
  if (PAYMENT_OK.has(token)) return true;
  // Free-text imports sometimes store "Paid in full" etc.
  if (token.includes("PAID") || token.includes("COMPLETE") || token.includes("CLEAR")) {
    return true;
  }
  return false;
}

export function isBirthCertificateSatisfied(
  status: string | null | undefined,
): boolean {
  const raw = (status || "").trim();
  if (!raw) return false;
  const token = normalizeToken(raw);
  if (BIRTH_CERT_OK.has(token)) return true;
  if (
    token.includes("ON FILE") ||
    token.includes("VERIFIED") ||
    token.includes("RECEIVED") ||
    token.includes("COMPLETE") ||
    token.includes("CLEAR")
  ) {
    return true;
  }
  return false;
}

export function hasGuardianContact(fields: PlayerCardFields): boolean {
  return Boolean(
    (fields.guardianEmail || "").trim() ||
      (fields.guardianPhone || "").trim() ||
      (fields.contactPhone || "").trim(),
  );
}

export function isRosterBlocked(status: string | null | undefined): boolean {
  const token = normalizeToken(status);
  if (!token) return false;
  return ROSTER_BLOCKED.has(token);
}

export function isRosterStatusOk(status: string | null | undefined): boolean {
  return !isRosterBlocked(status);
}

/**
 * Build checklist rows for a player. All keys are required for READY by default.
 */
export function buildPlayerChecks(fields: PlayerCardFields): PlayerCheckView[] {
  const guardianOk = hasGuardianContact(fields);
  const paymentOk = isPaymentSatisfied(fields.paymentStatus);
  const birthOk = isBirthCertificateSatisfied(fields.birthCertificateStatus);
  const liabilityOk = fields.liabilityWaiverAccepted === true;
  const conductOk = fields.codeOfConductAccepted === true;
  const refundOk = fields.refundPolicyAccepted === true;
  const medicalOk = fields.medicalTreatmentAuthorized === true;
  const rosterBlocked = isRosterBlocked(fields.rosterStatus);
  const rosterOk = !rosterBlocked;

  const values: Record<PlayerCheckKey, { ok: boolean; detail: string | null }> = {
    GUARDIAN_CONTACT: {
      ok: guardianOk,
      detail: guardianOk ? "Contact on file" : "Need guardian email, phone, or player phone",
    },
    PAYMENT: {
      ok: paymentOk,
      detail: fields.paymentStatus?.trim() || "Not set",
    },
    BIRTH_CERTIFICATE: {
      ok: birthOk,
      detail: fields.birthCertificateStatus?.trim() || "Not set",
    },
    LIABILITY_WAIVER: {
      ok: liabilityOk,
      detail: liabilityOk ? "Accepted" : "Not accepted",
    },
    CODE_OF_CONDUCT: {
      ok: conductOk,
      detail: conductOk ? "Accepted" : "Not accepted",
    },
    REFUND_POLICY: {
      ok: refundOk,
      detail: refundOk ? "Accepted" : "Not accepted",
    },
    MEDICAL_AUTH: {
      ok: medicalOk,
      detail: medicalOk ? "Authorized" : "Not authorized",
    },
    ROSTER_STATUS: {
      ok: rosterOk,
      detail: rosterBlocked
        ? `Blocked (${fields.rosterStatus})`
        : fields.rosterStatus?.trim() || "Active",
    },
  };

  return PLAYER_CHECK_KEYS.map((key) => ({
    key,
    label: PLAYER_CHECK_LABELS[key],
    ok: values[key].ok,
    required: true,
    detail: values[key].detail,
  }));
}

/**
 * READY = every required check ok and roster not blocked.
 * BLOCKED = roster status is dropped/inactive/etc.
 * INCOMPLETE = otherwise.
 */
export function computePlayerReadiness(
  fields: PlayerCardFields,
): PlayerReadiness {
  if (isRosterBlocked(fields.rosterStatus)) return "BLOCKED";
  const checks = buildPlayerChecks(fields);
  const incomplete = checks.some((c) => c.required && !c.ok);
  return incomplete ? "INCOMPLETE" : "READY";
}

export function summarizePlayerChecks(checks: PlayerCheckView[]) {
  const required = checks.filter((c) => c.required);
  const completeCount = required.filter((c) => c.ok).length;
  const total = required.length;
  return {
    completeCount,
    total,
    isComplete: completeCount === total && checks.every((c) => c.ok || !c.required),
    missingLabels: required.filter((c) => !c.ok).map((c) => c.label),
    readiness: ((): PlayerReadiness => {
      if (checks.some((c) => c.key === "ROSTER_STATUS" && !c.ok)) return "BLOCKED";
      if (required.some((c) => !c.ok)) return "INCOMPLETE";
      return "READY";
    })(),
  };
}
