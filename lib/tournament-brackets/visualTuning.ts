import type { BracketVisualTuning } from "@/lib/tournament-brackets/bracketSpec";

export type BracketVisualOffset = {
  xPx: number;
  yPx: number;
};

export type BracketVisualTuningTarget = "games" | "connectors";

export const VISUAL_TUNING_MIN_PX = -96;
export const VISUAL_TUNING_MAX_PX = 96;

const ZERO_OFFSET: BracketVisualOffset = { xPx: 0, yPx: 0 };

export function clampVisualTuningPx(value: number): number {
  return Math.max(VISUAL_TUNING_MIN_PX, Math.min(VISUAL_TUNING_MAX_PX, value));
}

export function normalizeVisualTuningNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(clampVisualTuningPx(parsed) * 10) / 10;
}

export function visualTuningOffset(
  tuning: BracketVisualTuning | null | undefined,
  target: BracketVisualTuningTarget,
  key: string,
): BracketVisualOffset {
  const offset = tuning?.[target]?.[key];
  const legacyChampionYOffset =
    target === "connectors" && (key === "g8-champion" || key === "g10-champion")
      ? tuning?.championConnectorYOffsetPx
      : undefined;
  return {
    xPx: offset?.xPx ?? ZERO_OFFSET.xPx,
    yPx: offset?.yPx ?? legacyChampionYOffset ?? ZERO_OFFSET.yPx,
  };
}

export function hasVisualOffset(offset: BracketVisualOffset): boolean {
  return offset.xPx !== 0 || offset.yPx !== 0;
}
