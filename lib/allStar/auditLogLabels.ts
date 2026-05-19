const NON_REVERTABLE_ACTIONS = new Set([
  "CANDIDATE_IMPORTED",
  "CYCLE_DELETED",
  "INVITE_ROSTER_SAVED",
]);

export function canRevertAllStarAuditAction(action: string) {
  return !NON_REVERTABLE_ACTIONS.has(action);
}

export function formatAllStarAuditActionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
