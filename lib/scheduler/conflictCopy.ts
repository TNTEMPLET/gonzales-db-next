const CONFLICT_LABELS: Record<string, string> = {
  team_already_scheduled_in_slot: "A team already has a game at this time",
  team_double_booked: "A team is already booked at this time",
  double_header_not_allowed: "This division does not play two games in one day",
  back_to_back_not_allowed: "This division does not play on back-to-back days",
  min_days_between_games: "This division needs more rest between games",
  max_games_per_week: "This division is already at its weekly game limit",
  park_not_allowed: "This park is not allowed for the division",
  field_not_allowed: "This field is not allowed for the division",
  time_not_allowed: "This start time is not allowed",
  unsupported_field_age_group: "This field does not host that age group",
  unsupported_field_division: "This field is not assigned to that division",
  slot_already_used: "That field and time is already taken",
  field_time_double_booked: "This field already has a game at this time",
  no_available_slots_defined: "The weekly board has no field times yet",
  no_available_slot: "No open field time fit this game",
  missing_matrix_rule: "Limits are missing for this division",
  MISSING_MATRIX_RULES: "Limits are missing for a selected division",
  MISSING_TEAMS: "A selected division needs at least two teams",
  INSUFFICIENT_SLOTS: "Some games could not be placed on the board",
  CONFLICT: "This game has a scheduling conflict",
};

function humanizeCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "";
  const spaced = trimmed.replace(/[_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatConflictReason(code: string): string {
  return CONFLICT_LABELS[code] ?? humanizeCode(code);
}

const PRIMARY_CODES = new Set([
  "max_games_per_week",
  "back_to_back_not_allowed",
  "min_days_between_games",
  "double_header_not_allowed",
  "no_available_slots_defined",
  "missing_matrix_rule",
  "MISSING_MATRIX_RULES",
  "MISSING_TEAMS",
  "INSUFFICIENT_SLOTS",
]);

const SCAN_NOISE = new Set([
  "unsupported_field_age_group",
  "unsupported_field_division",
  "park_not_allowed",
  "field_not_allowed",
  "time_not_allowed",
  "slot_already_used",
  "team_already_scheduled_in_slot",
]);

export function formatConflictReasons(codes: unknown): string[] {
  const raw = Array.isArray(codes)
    ? codes.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
  const unique = [...new Set(raw)];
  const primary = unique.filter((code) => PRIMARY_CODES.has(code));
  const visible = primary.length ? primary : unique.filter((code) => !SCAN_NOISE.has(code));
  const chosen = visible.length ? visible : unique;
  return [...new Set(chosen.map(formatConflictReason))];
}

export function formatConflictSummary(codes: unknown, empty = "None"): string {
  const labels = formatConflictReasons(codes);
  return labels.length ? labels.join(" · ") : empty;
}

export function formatGenerationError(error: { code?: string; message?: string }): string {
  const message = error.message?.trim() || "";
  if (message && !/^[A-Z_]+$/.test(message)) return message;
  if (error.code) return formatConflictReason(error.code);
  return message || "Could not generate this schedule";
}
