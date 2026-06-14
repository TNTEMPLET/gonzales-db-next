"use client";

import type { CSSProperties, ReactNode } from "react";

import { BracketConnectorCell } from "@/components/brackets/BracketConnector";
import styles from "@/components/brackets/TournamentBracketView.module.css";
import type { LayoutMatch } from "@/lib/tournament-brackets/bracketLayout";
import type { BracketMatchScores } from "@/lib/tournament-brackets/bracketScoring";

type BracketScoringViewProps = {
  enabled: boolean;
  editing: boolean;
  scores: Record<string, BracketMatchScores>;
  onScoresChange: (matchId: string, patch: Partial<BracketMatchScores>) => void;
};

type BracketLiveGameStatus = {
  scoreLabel?: string;
  inningLabel?: string;
  statusLabel?: string;
};

type MatchRenderProps = {
  match: LayoutMatch;
  scoring?: BracketScoringViewProps | null;
  liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
};

type Props = {
  matchesByGame: Map<string, LayoutMatch>;
  renderMatch: (props: MatchRenderProps & { match: LayoutMatch }) => ReactNode;
  scoring?: BracketScoringViewProps | null;
  liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
};

/** 5-team DYB-style winners path: G1/G2 openers, Gonzales enters G3, G6 championship of winners side. */
export default function FiveTeamDoubleElimWinnersGrid({
  matchesByGame,
  renderMatch,
  scoring,
  liveGameStatuses,
  onMatchClick,
  gameChangerEnabled,
}: Props) {
  const g1 = matchesByGame.get("1");
  const g2 = matchesByGame.get("2");
  const g3 = matchesByGame.get("3");
  const g6 = matchesByGame.get("6");

  if (!g1 || !g2 || !g3 || !g6) return null;

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns:
      "minmax(11rem, 1fr) minmax(1.25rem, 0.28fr) minmax(11rem, 1fr) minmax(1.25rem, 0.28fr) minmax(11rem, 1fr)",
    gridTemplateRows: "auto repeat(4, minmax(1rem, auto))",
    columnGap: "0.35rem",
    rowGap: "0.45rem",
    alignItems: "stretch",
    width: "100%",
    minWidth: 0,
  };

  const matchProps = { scoring, liveGameStatuses, onMatchClick, gameChangerEnabled };

  return (
    <div className={`${styles.bracketGrid} ${styles.bracketGridScroll}`} style={gridStyle}>
      <div className={styles.gridConnHdrSpacer} style={{ gridColumn: 1, gridRow: 1 }} aria-hidden />
      <div className={styles.gridConnHdrSpacer} style={{ gridColumn: 3, gridRow: 1 }} aria-hidden />
      <div className={styles.gridConnHdrSpacer} style={{ gridColumn: 5, gridRow: 1 }} aria-hidden />

      <div style={{ gridColumn: 1, gridRow: "2 / span 2" }}>
        {renderMatch({ match: g1, ...matchProps })}
      </div>
      <div style={{ gridColumn: 1, gridRow: "4 / span 2" }}>
        {renderMatch({ match: g2, ...matchProps })}
      </div>

      <div className={styles.connectorCell} style={{ gridColumn: 2, gridRow: "2 / span 2" }}>
        <BracketConnectorCell variant="top" topMatchId={g1.id} targetMatchId={g3.id} />
      </div>

      <div style={{ gridColumn: 3, gridRow: "2 / span 2" }}>
        {renderMatch({ match: g3, ...matchProps })}
      </div>

      <div className={styles.connectorCell} style={{ gridColumn: 4, gridRow: "2 / span 4" }}>
        <BracketConnectorCell
          variant="both"
          topMatchId={g3.id}
          bottomMatchId={g2.id}
          targetMatchId={g6.id}
        />
      </div>

      <div style={{ gridColumn: 5, gridRow: "2 / span 4" }}>
        {renderMatch({ match: g6, ...matchProps })}
      </div>
    </div>
  );
}

export function collectMatchesByOfficialGameNumber(
  rounds: { matches: LayoutMatch[] }[],
): Map<string, LayoutMatch> {
  const map = new Map<string, LayoutMatch>();
  for (const round of rounds) {
    for (const m of round.matches) {
      const key = m.officialGameNumber?.trim();
      if (key) map.set(key, m);
    }
  }
  return map;
}

export function isFiveTeamDoubleElimWinnersPattern(
  matchesByGame: Map<string, LayoutMatch>,
): boolean {
  return (
    matchesByGame.has("1") &&
    matchesByGame.has("2") &&
    matchesByGame.has("3") &&
    matchesByGame.has("6")
  );
}
