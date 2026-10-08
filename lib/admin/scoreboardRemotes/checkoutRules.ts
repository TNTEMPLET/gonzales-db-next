import { PARK_DIRECTOR_WRITE_DENIED } from "@/lib/admin/parkDirector/writeAccess";

import type { ScoreboardControllerStatus } from "@/lib/admin/scoreboardRemotes/present";

export const REMOTE_ALREADY_OUT = "That remote is already checked out.";
export const REMOTE_NOT_AVAILABLE = "That remote is not available.";
export const REMOTE_WRONG_PARK = "That remote is not at this park.";
export const REMOTE_ADD_FIRST = "Add remotes for this park in Manage remotes.";
export const REMOTE_GAME_ALREADY_OUT = "This game already has a remote out. Check it in first.";
export const VOLUNTEER_NAME_REQUIRED = "Enter the volunteer's first and last name.";
export const PICK_CHECKOUT_SIDE = "Pick the home or away team.";
export const CHECKOUT_NOT_FOUND = "That checkout was not found.";
export const ALREADY_CHECKED_IN = "That remote is already checked in.";

const POSTED_GAME_STATUSES = new Set(["LOCKED", "EXPORTED"]);
const CLOSES_OPEN_CHECKOUT = new Set(["MISSING", "REPAIR", "RETIRED"]);

/** Check-out only. A draft or canceled game can still be checked in. */
export function isPostedRemoteGame(status: string | null | undefined): boolean {
  return Boolean(status && POSTED_GAME_STATUSES.has(status));
}

/**
 * Missing, repair, and retired take the remote out of service.
 * The open checkout must close so the partial unique index releases it.
 */
export function statusClosesOpenCheckout(status: string | null | undefined): boolean {
  return Boolean(status && CLOSES_OPEN_CHECKOUT.has(status));
}

export function checkoutAfterControllerStatus<T extends { checkedInAt: Date | null }>(
  status: string,
  checkout: T,
  checkedInAt: Date,
): T {
  if (!statusClosesOpenCheckout(status) || checkout.checkedInAt) return checkout;
  return { ...checkout, checkedInAt };
}

export type CheckoutSide = "HOME" | "AWAY";

export function parseCheckoutSide(value: string | null | undefined): CheckoutSide | null {
  const side = value?.trim().toLowerCase();
  if (side === "home") return "HOME";
  if (side === "away") return "AWAY";
  return null;
}

/** First and last name, matching the old field-desk rule. */
export function normalizeVolunteerName(value: string | null | undefined): string | null {
  const name = (value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (name.split(" ").length < 2) return null;
  return name;
}

export function decideScoreboardCheckout(input: {
  writeAllowed: boolean;
  gameVenueId: string | null;
  venueRemoteCount: number;
  gameHasOpenCheckout: boolean;
  controller: { id: string; venueId: string; status: ScoreboardControllerStatus } | null;
  controllerHasOpenCheckout: boolean;
  volunteerName: string;
  side: string;
}): { ok: true; side: CheckoutSide; volunteerName: string } | { ok: false; error: string } {
  if (!input.writeAllowed) return { ok: false, error: PARK_DIRECTOR_WRITE_DENIED };
  if (!input.gameVenueId || input.venueRemoteCount === 0) {
    return { ok: false, error: REMOTE_ADD_FIRST };
  }
  if (input.gameHasOpenCheckout) return { ok: false, error: REMOTE_GAME_ALREADY_OUT };
  if (!input.controller || input.controller.venueId !== input.gameVenueId) {
    return { ok: false, error: REMOTE_WRONG_PARK };
  }
  if (input.controller.status !== "ACTIVE") return { ok: false, error: REMOTE_NOT_AVAILABLE };
  if (input.controllerHasOpenCheckout) return { ok: false, error: REMOTE_ALREADY_OUT };
  const side = parseCheckoutSide(input.side);
  if (!side) return { ok: false, error: PICK_CHECKOUT_SIDE };
  const volunteerName = normalizeVolunteerName(input.volunteerName);
  if (!volunteerName) return { ok: false, error: VOLUNTEER_NAME_REQUIRED };
  return { ok: true, side, volunteerName };
}

export function decideScoreboardCheckIn(input: {
  writeAllowed: boolean;
  checkout: { checkedInAt: Date | null } | null;
}): { ok: true } | { ok: false; error: string } {
  if (!input.checkout) return { ok: false, error: CHECKOUT_NOT_FOUND };
  if (!input.writeAllowed) return { ok: false, error: PARK_DIRECTOR_WRITE_DENIED };
  if (input.checkout.checkedInAt) return { ok: false, error: ALREADY_CHECKED_IN };
  return { ok: true };
}

/**
 * Check-in uses the same same-league and assigned-venue decision as check-out,
 * without requiring LOCKED or EXPORTED.
 *
 * A posted game keeps that denial. A game that is no longer posted, or a
 * checkout whose game link is gone, may also be closed by someone who can
 * write the remote's venue.
 */
export function decideCheckInAccess(input: {
  /** Null when the checkout has no game, or the game row is gone. */
  gameStatus: string | null;
  gameWriteAllowed: boolean;
  inventoryWriteAllowed: boolean;
}): { allowed: boolean } {
  if (input.gameStatus && isPostedRemoteGame(input.gameStatus)) {
    return { allowed: input.gameWriteAllowed };
  }
  return { allowed: input.gameWriteAllowed || input.inventoryWriteAllowed };
}
