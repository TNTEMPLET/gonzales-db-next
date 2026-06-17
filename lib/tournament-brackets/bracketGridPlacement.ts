import type { LayoutRound } from "@/lib/tournament-brackets/bracketLayout";
import { getBracketConnectorVariant } from "@/lib/tournament-brackets/bracketConnectorPaths";

function rowSpanForMatch(laneRows: number, layoutSlotCountInRound: number): number {
  return laneRows / layoutSlotCountInRound;
}

function matchAtCanonicalSlot(round: LayoutRound, slotIndex: number) {
  if (round.layoutSlotCount != null) {
    return round.matches.find((x) => x.canonicalSlotIndex === slotIndex) ?? null;
  }
  return round.matches[slotIndex] ?? null;
}

function incomingFeederVariant(rounds: LayoutRound[], roundIndex: number, slotIndex: number) {
  if (roundIndex <= 0) return "both";
  const prevRound = rounds[roundIndex - 1];
  if (!prevRound) return "both";
  const topHas = matchAtCanonicalSlot(prevRound, 2 * slotIndex) != null;
  const bottomHas = matchAtCanonicalSlot(prevRound, 2 * slotIndex + 1) != null;
  return getBracketConnectorVariant(topHas, bottomHas);
}

/** Compact 6-team: span only the two semi rows (canonical slots 1 and 3) plus the lane between them. */
export function compactSixPodiumBandPlacement(laneRows: number): { rowStart: number; span: number } | null {
  if (laneRows !== 4) return null;
  return { rowStart: 3, span: 3 };
}

/** Final match + champion column rows: always span the full live bracket lane band. */
export function podiumColumnGridPlacement(
  laneRows: number,
  useCompactSixTeamByeLayout: boolean,
): { rowStart: number; span: number } {
  void useCompactSixTeamByeLayout;
  return { rowStart: 2, span: laneRows };
}

/** Connected-grid row placement; compact 6-team single-feeder rounds use the feeder row only. */
export function matchGridPlacement(
  rounds: LayoutRound[],
  roundIndex: number,
  slotIndex: number,
  laneRows: number,
  useCompactSixTeamByeLayout: boolean,
): { rowStart: number; span: number } {
  const round = rounds[roundIndex]!;
  const slotCount = round.layoutSlotCount ?? round.matches.length;
  const span = rowSpanForMatch(laneRows, slotCount);
  const rowStart = 2 + slotIndex * span;

  if (!useCompactSixTeamByeLayout || roundIndex === 0) {
    return { rowStart, span };
  }

  const variant = incomingFeederVariant(rounds, roundIndex, slotIndex);
  if (variant === "both" || variant === "none") {
    return { rowStart, span };
  }

  const feederSlot = variant === "top" ? 2 * slotIndex : 2 * slotIndex + 1;
  return { rowStart: 2 + feederSlot, span: 1 };
}
