/**
 * Access badge foundation — Volunteer Cards will later mint event/gate
 * badges. Keep eligibility pure so scanners and admin tools can share it.
 */
import type { VolunteerCardView, VolunteerReadiness } from "./types";

export type AccessBadgeKind = "EVENT_GATE" | "FIELD_ACCESS" | "STAFF";

export type AccessBadgeEligibility = {
  volunteerProfileId: string;
  organizationId: string;
  seasonYear: number;
  readiness: VolunteerReadiness;
  /** True when card can be converted into an event access badge. */
  eligibleForEventAccess: boolean;
  reason: string;
  /** Stable id for future QR / badge payloads (not a secret). */
  publicBadgeSubject: string;
};

/**
 * Policy: only READY cards qualify for event access badges.
 * Incomplete / expired / blocked stay viewable as volunteer cards only.
 */
export function evaluateAccessBadgeEligibility(
  card: VolunteerCardView,
): AccessBadgeEligibility {
  const ready = card.readiness === "READY";
  return {
    volunteerProfileId: card.id,
    organizationId: card.organizationId,
    seasonYear: card.seasonYear,
    readiness: card.readiness,
    eligibleForEventAccess: ready,
    reason: ready
      ? "Compliance complete — ready for event access badges when issued."
      : `Not eligible for event access yet (${card.readiness.toLowerCase()}). Complete JDP and Abuse Awareness.`,
    publicBadgeSubject: `vpc_${card.id}`,
  };
}
