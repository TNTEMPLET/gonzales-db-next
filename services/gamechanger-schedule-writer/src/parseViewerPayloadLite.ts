export type ParsedLiveDetail = {
  balls?: number;
  strikes?: number;
  outsInHalf?: number;
  inning?: number;
  half?: "top" | "bottom";
};

function asNonNegativeInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return undefined;
}

function halfFromValue(value: unknown): "top" | "bottom" | undefined {
  if (value === "top" || value === "bottom") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "top") return "top";
    if (normalized === "bottom") return "bottom";
  }
  return undefined;
}

function pickCountFields(node: Record<string, unknown>): Partial<ParsedLiveDetail> {
  const balls =
    asNonNegativeInt(node.balls) ??
    asNonNegativeInt(node.ball_count) ??
    asNonNegativeInt(node.ballCount);
  const strikes =
    asNonNegativeInt(node.strikes) ??
    asNonNegativeInt(node.strike_count) ??
    asNonNegativeInt(node.strikeCount);
  const outs =
    asNonNegativeInt(node.outs) ??
    asNonNegativeInt(node.outs_in_inning) ??
    asNonNegativeInt(node.outsInInning) ??
    asNonNegativeInt(node.out_count);

  const inning =
    asNonNegativeInt(node.inning) ??
    asNonNegativeInt(node.inning_number) ??
    asNonNegativeInt(node.inningNumber);
  const half =
    halfFromValue(node.half) ??
    halfFromValue(node.inning_half) ??
    halfFromValue(node.inningHalf);

  const out: Partial<ParsedLiveDetail> = {};
  if (balls != null) out.balls = balls;
  if (strikes != null) out.strikes = strikes;
  if (outs != null) out.outsInHalf = outs % 3;
  if (inning != null) out.inning = inning;
  if (half) out.half = half;
  return out;
}

function mergeDetail(target: ParsedLiveDetail, patch: Partial<ParsedLiveDetail>): void {
  if (patch.balls != null) target.balls = patch.balls;
  if (patch.strikes != null) target.strikes = patch.strikes;
  if (patch.outsInHalf != null) target.outsInHalf = patch.outsInHalf;
  if (patch.inning != null) target.inning = patch.inning;
  if (patch.half) target.half = patch.half;
}

function walkForCounts(value: unknown, depth = 0): Partial<ParsedLiveDetail> {
  if (depth > 8 || value == null) return {};
  if (Array.isArray(value)) {
    let merged: Partial<ParsedLiveDetail> = {};
    for (const entry of value) {
      merged = { ...merged, ...walkForCounts(entry, depth + 1) };
    }
    return merged;
  }
  if (typeof value !== "object") return {};

  const record = value as Record<string, unknown>;
  let merged = pickCountFields(record);

  for (const key of ["count", "current_count", "currentCount", "game_situation", "gameSituation", "situation", "sport_specific", "bats", "scoreboard", "game_state", "gameState", "state", "payload", "data"]) {
    if (record[key] != null) {
      merged = { ...merged, ...walkForCounts(record[key], depth + 1) };
    }
  }

  const inningDetails = record.inning_details ?? record.inningDetails;
  if (inningDetails && typeof inningDetails === "object") {
    merged = { ...merged, ...pickCountFields(inningDetails as Record<string, unknown>) };
  }

  return merged;
}

export function parseViewerPayloadLite(json: unknown): ParsedLiveDetail {
  const detail: ParsedLiveDetail = {};
  mergeDetail(detail, walkForCounts(json));
  return detail;
}
