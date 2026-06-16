"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  BracketConnectorCell,
  BracketHorizontalGutterConnector,
  BracketIfNecessaryDropConnector,
  type BracketConnectorAnchor,
} from "@/components/brackets/BracketConnector";
import {
  CLASSIC_DE_CHAMPION_SLOT_MATCH_ID,
  ClassicIfNecessaryMatchCell,
} from "@/components/brackets/ClassicDoubleElimDiagram";
import ClassicTournamentInfoTable from "@/components/brackets/ClassicTournamentInfoTable";
import styles from "@/components/brackets/TournamentBracketView.module.css";
import { BRACKET_PODIUM_CHAMPION_TARGET_ATTR } from "@/lib/tournament-brackets/bracketConnectorPaths";
import type { BracketTournamentInfo } from "@/lib/tournament-brackets/bracketSpec";
import type { ClassicDoubleElimChampionshipPodium, LayoutMatch } from "@/lib/tournament-brackets/bracketLayout";
import type { ClassicSixTeamModifiedDeSlots } from "@/lib/tournament-brackets/classicSixTeamModifiedDeDiagram";
import type { ClassicGridPlacement } from "@/lib/tournament-brackets/classicDoubleElimGridPlacement";
import { classicUnifiedGridTemplateColumns } from "@/lib/tournament-brackets/classicUnifiedGridColumns";
import {
  CLASSIC_6TEAM_DE_LANE_ROWS,
  classicSixTeamModifiedDeGridSlots,
} from "@/lib/tournament-brackets/classicSixTeamModifiedDeGridPlacement";
import type { BracketMatchScores } from "@/lib/tournament-brackets/bracketScoring";

const GRID_ROW_TRACK = `repeat(${CLASSIC_6TEAM_DE_LANE_ROWS}, minmax(2.75rem, auto))`;
const anchorY: BracketConnectorAnchor = "match";
const grid = classicSixTeamModifiedDeGridSlots();
const MATCH_ID_ATTR = "data-bracket-match-id";

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
  slots: ClassicSixTeamModifiedDeSlots;
  tournamentInfo?: BracketTournamentInfo | null;
  championPodium?: ClassicDoubleElimChampionshipPodium | null;
  renderMatch: (props: MatchRenderProps & { match: LayoutMatch }) => ReactNode;
  scoring?: BracketScoringViewProps | null;
  liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
  /** Public viewer: shrink column mins so the full diagram fits without clipping. */
  fluidWidth?: boolean;
};

function matchCenterY(el: Element): number {
  const rect = el.getBoundingClientRect();
  return (rect.top + rect.bottom) / 2;
}

function fillerCell(key: string, { col, row, span, colSpan }: ClassicGridPlacement, className?: string): ReactNode {
  return (
    <div
      key={key}
      className={className ? `${styles.gridSlotFiller} ${className}` : styles.gridSlotFiller}
      style={{
        gridColumn: colSpan ? `${col} / span ${colSpan}` : col,
        gridRow: `${row} / span ${span}`,
      }}
      aria-hidden
    />
  );
}

function matchCell(key: string, { col, row, span }: ClassicGridPlacement, content: ReactNode, wrapClassName?: string): ReactNode {
  return (
    <div
      key={key}
      className={wrapClassName ? `${styles.gridMatchWrap} ${wrapClassName}` : styles.gridMatchWrap}
      style={{ gridColumn: col, gridRow: `${row} / span ${span}` }}
    >
      {content}
    </div>
  );
}

function connCell(key: string, { col, row, span }: ClassicGridPlacement, content: ReactNode, dataBracketConn?: string): ReactNode {
  return (
    <div
      key={key}
      className={styles.connectorCell}
      style={{ gridColumn: col, gridRow: `${row} / span ${span}` }}
      {...(dataBracketConn ? { "data-bracket-conn": dataBracketConn } : {})}
    >
      {content}
    </div>
  );
}

function ClassicGrandFinalCell({
  placement,
  topMatchId,
  bottomMatchId,
  selfMatchId,
  children,
}: {
  placement: ClassicGridPlacement;
  topMatchId: string;
  bottomMatchId: string;
  selfMatchId: string;
  children: ReactNode;
}) {
  const { col, row, span } = placement;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [topPx, setTopPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const gridEl = wrap.closest(`.${styles.classicDoubleElimGrid}`);
      if (!gridEl) return;
      const topMatch = gridEl.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(topMatchId)}"]`);
      const bottomMatch = gridEl.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(bottomMatchId)}"]`);
      const selfMatch = gridEl.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(selfMatchId)}"]`);
      if (!topMatch || !bottomMatch || !selfMatch) return;
      const wrapRect = wrap.getBoundingClientRect();
      const targetCenter = (matchCenterY(topMatch) + matchCenterY(bottomMatch)) / 2;
      const selfHeight = selfMatch.getBoundingClientRect().height;
      if (selfHeight <= 0) return;
      setTopPx(targetCenter - wrapRect.top - selfHeight / 2);
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(measure));
    const ro = new ResizeObserver(measure);
    const wrap = wrapRef.current;
    if (wrap) ro.observe(wrap);
    const gridEl = wrap?.closest(`.${styles.classicDoubleElimGrid}`);
    for (const id of [topMatchId, bottomMatchId, selfMatchId]) {
      const match = gridEl?.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(id)}"]`);
      if (match) ro.observe(match);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [bottomMatchId, selfMatchId, topMatchId]);

  return (
    <div
      ref={wrapRef}
      className={`${styles.gridMatchWrap} ${styles.classicDoubleElimGrandFinalWrap}`}
      style={{ gridColumn: col, gridRow: `${row} / span ${span}` }}
    >
      <div className={styles.classicDoubleElimGrandFinalInner} style={topPx != null ? { top: topPx } : undefined}>
        {children}
      </div>
    </div>
  );
}

function ClassicAlignedToMatchCell({
  placement,
  alignToMatchId,
  children,
}: {
  placement: ClassicGridPlacement;
  alignToMatchId: string;
  children: ReactNode;
}) {
  const { col, row, span } = placement;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [topPx, setTopPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const gridEl = wrap.closest(`.${styles.classicDoubleElimGrid}`);
      if (!gridEl) return;
      const refMatch = gridEl.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(alignToMatchId)}"]`);
      const selfMatch =
        wrap.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(CLASSIC_DE_CHAMPION_SLOT_MATCH_ID)}"]`) ??
        wrap.querySelector("article");
      if (!refMatch || !selfMatch) return;
      const wrapRect = wrap.getBoundingClientRect();
      const targetCenter = matchCenterY(refMatch);
      const selfHeight = selfMatch.getBoundingClientRect().height;
      if (selfHeight <= 0) return;
      setTopPx(targetCenter - wrapRect.top - selfHeight / 2);
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(measure));
    const ro = new ResizeObserver(measure);
    const wrap = wrapRef.current;
    if (wrap) ro.observe(wrap);
    const gridEl = wrap?.closest(`.${styles.classicDoubleElimGrid}`);
    for (const id of [alignToMatchId, CLASSIC_DE_CHAMPION_SLOT_MATCH_ID]) {
      const match = gridEl?.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(id)}"]`);
      if (match) ro.observe(match);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [alignToMatchId]);

  return (
    <div
      ref={wrapRef}
      className={`${styles.gridMatchWrap} ${styles.classicDoubleElimChampionWrap}`}
      style={{ gridColumn: col, gridRow: `${row} / span ${span}` }}
    >
      <div className={styles.classicDoubleElimGrandFinalInner} style={topPx != null ? { top: topPx } : undefined}>
        {children}
      </div>
    </div>
  );
}

function ClassicChampionPlaque({ heading, teamName }: { heading: string; teamName?: string | null }) {
  const decided = teamName?.trim();
  const isTbd = !decided;
  return (
    <article
      data-bracket-match-id={CLASSIC_DE_CHAMPION_SLOT_MATCH_ID}
      className={styles.classicDoubleElimChampionSlot}
      aria-label={isTbd ? `${heading}. Champion not yet decided.` : `${heading}: ${decided}`}
    >
      <div
        className={isTbd ? `${styles.championPlaque} ${styles.championPlaqueUndecided}` : styles.championPlaque}
        {...{ [BRACKET_PODIUM_CHAMPION_TARGET_ATTR]: "" }}
      >
        {isTbd ? (
          <div className={styles.championPlaqueTitleCentered}>{heading}</div>
        ) : (
          <>
            <div className={styles.championPlaqueTitle}>{heading}</div>
            <div className={styles.championPlaqueName}>{decided}</div>
          </>
        )}
      </div>
    </article>
  );
}

/** Classic unified diagram for 6-team Little League double elimination (G1–G11). */
export default function ClassicSixTeamModifiedDeDiagram({
  slots,
  tournamentInfo,
  championPodium,
  renderMatch,
  scoring,
  liveGameStatuses,
  onMatchClick,
  gameChangerEnabled,
  fluidWidth = false,
}: Props) {
  const [g1, g2] = slots.openers;
  const [g3, g4] = slots.winnersSemis;
  const g7 = slots.winnersFinal;
  const [g5, g6] = slots.losersRound1;
  const g8 = slots.losersRound2;
  const g9 = slots.losersCrossover;
  const g10 = slots.grandFinal;
  const g11 = slots.ifNecessary;

  const showChampionColumn = Boolean(championPodium);
  const showIfNecessaryGame = Boolean(championPodium?.showIfNecessaryDropLine && g11);
  const matchProps = { scoring, liveGameStatuses, onMatchClick, gameChangerEnabled };
  const render = (match: LayoutMatch) => renderMatch({ match, ...matchProps });

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: classicUnifiedGridTemplateColumns({
      withChampionColumn: showChampionColumn,
      fluidWidth,
    }),
    gridTemplateRows: GRID_ROW_TRACK,
    columnGap: "0.35rem",
    rowGap: "0.25rem",
    alignItems: "stretch",
    width: "100%",
    minWidth: 0,
  };

  const bandGapPlacement: ClassicGridPlacement = {
    ...grid.bandGap,
    colSpan: showChampionColumn ? 9 : grid.bandGap.colSpan,
  };
  const tournamentInfoPlacement: ClassicGridPlacement = {
    ...grid.tournamentInfo,
    colSpan: showChampionColumn ? 5 : grid.tournamentInfo.colSpan,
  };

  return (
    <div
      className={`${styles.doubleElimUnified} ${styles.classicDoubleElimUnified}${showChampionColumn ? ` ${styles.classicDoubleElimWithChampionColumn}` : ""}`}
      data-connector-anchor={anchorY}
    >
      <div
        className={`${styles.bracketGrid} ${styles.bracketGridScroll} ${styles.classicDoubleElimGrid}`}
        style={gridStyle}
      >
        {fillerCell("winners-top-pad", grid.winnersTopPad, styles.classicDoubleElimWinnersTopPad)}
        <ClassicTournamentInfoTable info={tournamentInfo} placement={tournamentInfoPlacement} />
        {matchCell("g1", grid.g1, render(g1))}
        {matchCell("g2", grid.g2, render(g2))}

        {connCell(
          "c-g1-g3",
          grid.connG1G3,
          <BracketConnectorCell variant="top" anchorY={anchorY} topMatchId={g1.id} targetMatchId={g3.id} />,
        )}
        {connCell(
          "c-g2-g4",
          grid.connG2G4,
          <BracketConnectorCell variant="top" anchorY={anchorY} topMatchId={g2.id} targetMatchId={g4.id} />,
        )}
        {matchCell("g3", grid.g3, render(g3))}
        {matchCell("g4", grid.g4, render(g4))}

        {connCell(
          "c-winners-g7",
          grid.connWinnersG7,
          <BracketConnectorCell
            variant="both"
            anchorY={anchorY}
            topMatchId={g3.id}
            bottomMatchId={g4.id}
            targetMatchId={g7.id}
          />,
        )}
        {matchCell("g7", grid.g7, render(g7))}

        {fillerCell("band-gap", bandGapPlacement, styles.classicDoubleElimBandGap)}

        {matchCell("g5", grid.g5, render(g5))}
        {matchCell("g6", grid.g6, render(g6))}
        {connCell(
          "c-losers-g8",
          grid.connLosersG8,
          <BracketConnectorCell
            variant="both"
            anchorY={anchorY}
            topMatchId={g5.id}
            bottomMatchId={g6.id}
            targetMatchId={g8.id}
          />,
        )}
        {matchCell("g8", grid.g8, render(g8))}
        {connCell(
          "c-g8-g9",
          grid.connG8G9,
          <BracketConnectorCell variant="top" anchorY={anchorY} topMatchId={g8.id} targetMatchId={g9.id} />,
        )}
        {matchCell("g9", grid.g9, render(g9))}

        {connCell(
          "c-finals-g10",
          grid.connFinalsG10,
          <BracketConnectorCell
            variant="both"
            anchorY={anchorY}
            topMatchId={g7.id}
            bottomMatchId={g9.id}
            targetMatchId={g10.id}
          />,
        )}

        <ClassicGrandFinalCell
          placement={grid.g10}
          topMatchId={g7.id}
          bottomMatchId={g9.id}
          selfMatchId={g10.id}
        >
          {render(g10)}
        </ClassicGrandFinalCell>

        {showChampionColumn && championPodium ? (
          <>
            {connCell(
              "c-g10-champion",
              grid.connG10Champion,
              <>
                <BracketHorizontalGutterConnector
                  sourceMatchId={g10.id}
                  targetMatchId={CLASSIC_DE_CHAMPION_SLOT_MATCH_ID}
                  anchorY={anchorY}
                />
                {championPodium.showIfNecessaryDropLine ? (
                  <BracketIfNecessaryDropConnector
                    sourceMatchId={g10.id}
                    targetMatchId={CLASSIC_DE_CHAMPION_SLOT_MATCH_ID}
                    ifNecessaryMatchId={g11?.id}
                    anchorY={anchorY}
                  />
                ) : null}
              </>,
              "g10-champion",
            )}
            {showIfNecessaryGame && g11 ? (
              <ClassicIfNecessaryMatchCell
                placement={grid.g11}
                dropLineConnKey="g10-champion"
                matchId={g11.id}
                widthMatchId={g10.id}
              >
                {render(g11)}
              </ClassicIfNecessaryMatchCell>
            ) : null}
            <ClassicAlignedToMatchCell placement={grid.champion} alignToMatchId={g10.id}>
              <ClassicChampionPlaque heading={championPodium.championHeading} teamName={championPodium.championTeamName} />
            </ClassicAlignedToMatchCell>
          </>
        ) : null}
      </div>
    </div>
  );
}
