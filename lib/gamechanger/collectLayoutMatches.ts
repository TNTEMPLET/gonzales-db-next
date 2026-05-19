import { formatBracketGameBadge } from "@/lib/tournament-brackets/bracketDisplayLabels";
import { BRACKET_THIRD_PLACE_MATCH_ID } from "@/lib/tournament-brackets/bracketScoring";
import type { BracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import type { GcBracketMatchRef } from "@/lib/gamechanger/types";

export function collectLayoutMatchesForGc(layout: BracketLayout): GcBracketMatchRef[] {
  if (layout.mode === "empty") return [];

  if (layout.mode === "match_grid") {
    return layout.games.map((g) => ({
      id: g.id,
      home: g.homeTeam,
      away: g.awayTeam,
      officialGameNumber: g.gameNumber,
      dateLabel: g.dateLabel,
      time: g.time,
    }));
  }

  const refs: GcBracketMatchRef[] = [];
  for (const round of layout.rounds) {
    for (const m of round.matches) {
      refs.push({
        id: m.id,
        home: m.slotHome,
        away: m.slotAway,
        officialGameNumber: m.officialGameNumber,
        dateLabel: m.dateLabel,
        time: m.time,
      });
    }
  }

  if (layout.podium?.thirdPlaceGameInfo || layout.podium?.thirdPlaceSlotHome) {
    const tp = layout.podium;
    refs.push({
      id: BRACKET_THIRD_PLACE_MATCH_ID,
      home: tp.thirdPlaceSlotHome,
      away: tp.thirdPlaceSlotAway,
      officialGameNumber: tp.thirdPlaceGameInfo?.officialGameNumber,
      dateLabel: tp.thirdPlaceGameInfo?.dateLabel,
      time: tp.thirdPlaceGameInfo?.time,
    });
  }

  return refs;
}

export function bracketMatchRefForId(layout: BracketLayout, matchId: string): GcBracketMatchRef | undefined {
  return collectLayoutMatchesForGc(layout).find((r) => r.id === matchId);
}

export function bracketMatchLabelForId(layout: BracketLayout, matchId: string): string | undefined {
  const ref = collectLayoutMatchesForGc(layout).find((r) => r.id === matchId);
  if (!ref) return undefined;
  const badge = formatBracketGameBadge(ref.officialGameNumber);
  const teams = `${ref.home} vs ${ref.away}`;
  if (matchId === BRACKET_THIRD_PLACE_MATCH_ID) {
    return badge ? `3rd place · ${badge} · ${teams}` : `3rd place · ${teams}`;
  }
  return badge ? `${badge} · ${teams}` : teams;
}
