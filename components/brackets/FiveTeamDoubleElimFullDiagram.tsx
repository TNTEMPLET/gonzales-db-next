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

type Props = MatchRenderProps & {
  matchesByGame: Map<string, LayoutMatch>;
  renderMatch: (props: MatchRenderProps & { match: LayoutMatch }) => ReactNode;
};

const GRID_COLUMNS =
  "minmax(11rem, 1fr) minmax(1.25rem, 0.28fr) minmax(11rem, 1fr) minmax(1.25rem, 0.28fr) minmax(11rem, 1fr) minmax(1.25rem, 0.28fr) minmax(11rem, 1fr)";

/**
 * Full 5-team DYB double-elimination diagram (District 6 10U):
 * winners tree (G1/G2 → G3 → G6), losers chain (G4 → G5), championship (G7–G9).
 * Matches the connected Gonzales city-bracket style in one scrollable diagram.
 */
export default function FiveTeamDoubleElimFullDiagram({
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
  const g4 = matchesByGame.get("4");
  const g5 = matchesByGame.get("5");
  const g6 = matchesByGame.get("6");
  const g7 = matchesByGame.get("7");
  const g8 = matchesByGame.get("8");
  const g9 = matchesByGame.get("9");

  if (!g1 || !g2 || !g3 || !g4 || !g5 || !g6 || !g7 || !g8 || !g9) return null;

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: GRID_COLUMNS,
    gridTemplateRows:
      "auto auto repeat(4, minmax(1rem, auto)) auto auto repeat(4, minmax(1rem, auto))",
    columnGap: "0.35rem",
    rowGap: "0.45rem",
    alignItems: "stretch",
    width: "100%",
    minWidth: 0,
  };

  const matchProps = { scoring, liveGameStatuses, onMatchClick, gameChangerEnabled };

  const winnersStart = 3;
  const losersStart = 9;

  return (
    <div className={styles.doubleElimUnified}>
      <div className={`${styles.bracketGrid} ${styles.bracketGridScroll}`} style={gridStyle}>
        <div
          className={styles.doubleElimBandLabel}
          style={{ gridColumn: "1 / 6", gridRow: 1 }}
        >
          Winners Bracket
        </div>
        <div className={styles.doubleElimBandLabel} style={{ gridColumn: 7, gridRow: 1 }}>
          Championship
        </div>

        <div className={styles.gridConnHdrSpacer} style={{ gridColumn: 1, gridRow: 2 }} aria-hidden />
        <div className={styles.gridConnHdrSpacer} style={{ gridColumn: 3, gridRow: 2 }} aria-hidden />
        <div className={styles.gridConnHdrSpacer} style={{ gridColumn: 5, gridRow: 2 }} aria-hidden />
        <div className={styles.gridConnHdrSpacer} style={{ gridColumn: 7, gridRow: 2 }} aria-hidden />

        {/* Winners bracket */}
        <div style={{ gridColumn: 1, gridRow: `${winnersStart} / span 2` }}>
          {renderMatch({ match: g1, ...matchProps })}
        </div>
        <div style={{ gridColumn: 1, gridRow: `${winnersStart + 2} / span 2` }}>
          {renderMatch({ match: g2, ...matchProps })}
        </div>

        <div
          className={styles.connectorCell}
          style={{ gridColumn: 2, gridRow: `${winnersStart} / span 2` }}
        >
          <BracketConnectorCell variant="top" topMatchId={g1.id} targetMatchId={g3.id} />
        </div>

        <div style={{ gridColumn: 3, gridRow: `${winnersStart} / span 2` }}>
          {renderMatch({ match: g3, ...matchProps })}
        </div>

        <div
          className={styles.connectorCell}
          style={{ gridColumn: 4, gridRow: `${winnersStart} / span 4` }}
        >
          <BracketConnectorCell
            variant="both"
            topMatchId={g3.id}
            bottomMatchId={g2.id}
            targetMatchId={g6.id}
          />
        </div>

        <div style={{ gridColumn: 5, gridRow: `${winnersStart} / span 4` }}>
          {renderMatch({ match: g6, ...matchProps })}
        </div>

        {/* Losers bracket band label */}
        <div
          className={styles.doubleElimBandLabel}
          style={{ gridColumn: "1 / 6", gridRow: 7 }}
        >
          Losers Bracket
        </div>

        <div style={{ gridColumn: 1, gridRow: `${losersStart} / span 2` }}>
          {renderMatch({ match: g4, ...matchProps })}
        </div>

        <div
          className={styles.connectorCell}
          style={{ gridColumn: 2, gridRow: `${losersStart} / span 2` }}
        >
          <BracketConnectorCell variant="top" topMatchId={g4.id} targetMatchId={g5.id} />
        </div>

        <div style={{ gridColumn: 5, gridRow: `${losersStart} / span 4` }}>
          {renderMatch({ match: g5, ...matchProps })}
        </div>

        {/* Championship column */}
        <div
          className={styles.connectorCell}
          style={{ gridColumn: 6, gridRow: `${winnersStart} / span 10` }}
        >
          <BracketConnectorCell
            variant="both"
            topMatchId={g6.id}
            bottomMatchId={g5.id}
            targetMatchId={g7.id}
          />
        </div>

        <div style={{ gridColumn: 7, gridRow: `${winnersStart} / span 2` }}>
          {renderMatch({ match: g7, ...matchProps })}
        </div>

        <div className={styles.connectorCell} style={{ gridColumn: 7, gridRow: winnersStart + 2 }}>
          <BracketConnectorCell variant="top" topMatchId={g7.id} targetMatchId={g8.id} />
        </div>

        <div style={{ gridColumn: 7, gridRow: `${winnersStart + 3} / span 2` }}>
          {renderMatch({ match: g8, ...matchProps })}
        </div>

        <div className={styles.connectorCell} style={{ gridColumn: 7, gridRow: 8 }}>
          <BracketConnectorCell variant="top" topMatchId={g8.id} targetMatchId={g9.id} />
        </div>

        <div style={{ gridColumn: 7, gridRow: `${losersStart} / span 2` }}>
          {renderMatch({ match: g9, ...matchProps })}
        </div>
      </div>
    </div>
  );
}
