import type { PlayerCardAudience, PlayerCardView } from "./types";

/**
 * Audience-based field strip for player cards.
 * - ADMIN: full card
 * - COACH: medical details hidden; address kept for operational use
 * - GUARDIAN: no address, no medical details/summary
 */
export function toPublicPlayerCard(
  card: PlayerCardView,
  audience: PlayerCardAudience,
): PlayerCardView {
  if (audience === "ADMIN") return card;

  if (audience === "COACH") {
    return {
      ...card,
      medicalConditionsDetails: null,
    };
  }

  // GUARDIAN
  return {
    ...card,
    streetAddress: null,
    unit: null,
    postalCode: null,
    // Keep city/state for location context if needed later; plan default hide full address.
    // city/state retained for "where we play" context; street hidden.
    medicalConditionsSummary: null,
    medicalConditionsDetails: null,
  };
}
