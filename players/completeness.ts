/**
 * Client-safe completeness helpers for admin/coach roster tables.
 * Prefer this over inline getPlayerProfileCompleteness duplicates.
 */
import { buildPlayerChecks, computePlayerReadiness, summarizePlayerChecks } from "./readiness";
import type { PlayerCardFields, PlayerReadiness } from "./types";

export type PlayerProfileCompleteness = {
  completeCount: number;
  total: number;
  isComplete: boolean;
  missingLabels: string[];
  readiness: PlayerReadiness;
};

/**
 * Score used in roster tables (profile chip).
 * Admin and coach share the same required checklist.
 */
export function getPlayerProfileCompleteness(
  player: PlayerCardFields,
): PlayerProfileCompleteness {
  const checks = buildPlayerChecks(player);
  const summary = summarizePlayerChecks(checks);
  return {
    completeCount: summary.completeCount,
    total: summary.total,
    isComplete: summary.isComplete,
    missingLabels: summary.missingLabels,
    readiness: summary.readiness || computePlayerReadiness(player),
  };
}

/** True when import/row has no guardian email or phone (player phone alone still counts as contact for readiness). */
export function isMissingGuardianContact(fields: {
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  contactPhone?: string | null;
}): boolean {
  return !(
    (fields.guardianEmail || "").trim() ||
    (fields.guardianPhone || "").trim() ||
    (fields.contactPhone || "").trim()
  );
}

/** Stricter import metric: missing guardian email specifically (parent portal key). */
export function isMissingGuardianEmail(fields: {
  guardianEmail?: string | null;
}): boolean {
  return !(fields.guardianEmail || "").trim();
}
