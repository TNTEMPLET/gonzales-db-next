/** Ordered field ids from Limits. Empty = no preference. */

export function parseFieldPriorityIds(ruleMetadata: unknown): string[] {
  if (!ruleMetadata || typeof ruleMetadata !== "object" || Array.isArray(ruleMetadata)) return [];
  const raw = (ruleMetadata as { fieldPriorityIds?: unknown }).fieldPriorityIds;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** 0 = first choice. Unlisted fields sort after every listed field. */
export function fieldPriorityRank(fieldId: string, priorityIds: readonly string[]): number {
  const index = priorityIds.indexOf(fieldId);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

export type FieldPriorityClaimant = {
  division: string;
  pairsNeeded: number;
  priorityIds: readonly string[];
};

/**
 * First-choice field only: 8U listing Gauthier first claims Gauthier, not every
 * later field on the same list. Same #1: more pairs, then name.
 */
export function claimedFieldOwner(
  fieldId: string,
  claimants: readonly FieldPriorityClaimant[],
): string | null {
  const firstChoice = claimants.filter((claimant) => claimant.priorityIds[0] === fieldId);
  if (!firstChoice.length) return null;
  const ranked = [...firstChoice].sort((a, b) => {
    if (b.pairsNeeded !== a.pairsNeeded) return b.pairsNeeded - a.pairsNeeded;
    return a.division.localeCompare(b.division);
  });
  return ranked[0]?.division ?? null;
}

export function fieldClaimsForNight(
  fieldIds: readonly string[],
  claimants: readonly FieldPriorityClaimant[],
): Map<string, string> {
  const claims = new Map<string, string>();
  for (const fieldId of fieldIds) {
    const owner = claimedFieldOwner(fieldId, claimants);
    if (owner) claims.set(fieldId, owner);
  }
  return claims;
}

export function fieldsClaimedByOthers(division: string, claims: Map<string, string>): Set<string> {
  const blocked = new Set<string>();
  for (const [fieldId, owner] of claims) {
    if (owner !== division) blocked.add(fieldId);
  }
  return blocked;
}
