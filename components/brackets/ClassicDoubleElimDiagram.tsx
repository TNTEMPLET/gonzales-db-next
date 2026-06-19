"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  BracketConnectorCell,
  BracketHorizontalGutterConnector,
  BracketIfNecessaryDropConnector,
  type BracketConnectorAnchor,
} from "@/components/brackets/BracketConnector";
import ClassicTournamentInfoTable from "@/components/brackets/ClassicTournamentInfoTable";
import styles from "@/components/brackets/TournamentBracketView.module.css";
import { BRACKET_PODIUM_CHAMPION_TARGET_ATTR } from "@/lib/tournament-brackets/bracketConnectorPaths";
import type { BracketTournamentInfo, BracketVisualTuning } from "@/lib/tournament-brackets/bracketSpec";
import type { ClassicDoubleElimChampionshipPodium, LayoutMatch } from "@/lib/tournament-brackets/bracketLayout";
import type { ClassicDoubleElimSlots } from "@/lib/tournament-brackets/classicDoubleElimDiagram";
import {
  hasVisualOffset,
  visualTuningOffset,
  type BracketVisualOffset,
} from "@/lib/tournament-brackets/visualTuning";
import {
  CLASSIC_DE_LANE_ROWS,
  classicDoubleElimGridSlots,
  type ClassicGridPlacement,
} from "@/lib/tournament-brackets/classicDoubleElimGridPlacement";
import { classicUnifiedGridTemplateColumns } from "@/lib/tournament-brackets/classicUnifiedGridColumns";
import type { BracketMatchScores } from "@/lib/tournament-brackets/bracketScoring";

/** Whole-card vertical center for all classic diagram connectors. */
export const CLASSIC_DE_CONNECTOR_ANCHOR: BracketConnectorAnchor = "match";

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

/** Synthetic match id for the champion plaque column (standard DE only). */
export const CLASSIC_DE_CHAMPION_SLOT_MATCH_ID = "__classic_de_champion__";

type MatchRenderProps = {
  match: LayoutMatch;
  scoring?: BracketScoringViewProps | null;
  liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
};

type Props = {
  slots: ClassicDoubleElimSlots;
  tournamentInfo?: BracketTournamentInfo | null;
  visualTuning?: BracketVisualTuning | null;
  /** Champion plaque in a column right of G8 (both DE formats on classic diagram). */
  championPodium?: ClassicDoubleElimChampionshipPodium | null;
  renderMatch: (props: MatchRenderProps & { match: LayoutMatch }) => ReactNode;
  scoring?: BracketScoringViewProps | null;
  liveGameStatuses?: Record<string, BracketLiveGameStatus> | null;
  onMatchClick?: (matchId: string) => void;
  gameChangerEnabled?: boolean;
  /** Public viewer: shrink column mins so the full diagram fits without clipping. */
  fluidWidth?: boolean;
};

const GRID_ROW_TRACK = `repeat(${CLASSIC_DE_LANE_ROWS}, minmax(2.75rem, auto))`;

const grid = classicDoubleElimGridSlots();

function visualOffsetStyle(offset: BracketVisualOffset): CSSProperties | undefined {
  if (!hasVisualOffset(offset)) return undefined;
  return { transform: `translate(${offset.xPx}px, ${offset.yPx}px)` };
}

function fillerCell(
  key: string,
  { col, row, span, colSpan }: ClassicGridPlacement,
  className?: string,
): ReactNode {
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

function matchCell(
  key: string,
  { col, row, span }: ClassicGridPlacement,
  content: ReactNode,
  wrapClassName?: string,
  offset: BracketVisualOffset = { xPx: 0, yPx: 0 },
): ReactNode {
  return (
    <div
      key={key}
      className={wrapClassName ? `${styles.gridMatchWrap} ${wrapClassName}` : styles.gridMatchWrap}
      style={{ gridColumn: col, gridRow: `${row} / span ${span}`, ...visualOffsetStyle(offset) }}
    >
      {content}
    </div>
  );
}

const MATCH_ID_ATTR = "data-bracket-match-id";

function matchCenterY(el: Element): number {
  const rect = el.getBoundingClientRect();
  return (rect.top + rect.bottom) / 2;
}

function ClassicDoubleElimChampionPlaque({
  heading,
  teamName,
}: {
  heading: string;
  teamName?: string | null;
}) {
  const decided = teamName?.trim();
  const isTbd = !decided;
  return (
    <article
      data-bracket-match-id={CLASSIC_DE_CHAMPION_SLOT_MATCH_ID}
      className={styles.classicDoubleElimChampionSlot}
      aria-label={isTbd ? `${heading}. Champion not yet decided.` : `${heading}: ${decided}`}
    >
      <div
        className={
          isTbd
            ? `${styles.championPlaque} ${styles.championPlaqueUndecided}`
            : styles.championPlaque
        }
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

/** Vertically centers content on another match card's midline (used for G8-aligned champion column). */
function ClassicAlignedToMatchCell({
  placement,
  alignToMatchId,
  alignBetweenTopMatchId,
  alignBetweenBottomMatchId,
  alignToBracketMidline = false,
  offset = { xPx: 0, yPx: 0 },
  children,
  wrapClassName,
}: {
  placement: ClassicGridPlacement;
  alignToMatchId?: string;
  alignBetweenTopMatchId?: string;
  alignBetweenBottomMatchId?: string;
  alignToBracketMidline?: boolean;
  offset?: BracketVisualOffset;
  children: ReactNode;
  wrapClassName?: string;
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

      let targetCenter: number;
      const wrapRect = wrap.getBoundingClientRect();
      if (alignToBracketMidline) {
        targetCenter = (wrapRect.top + wrapRect.bottom) / 2;
      } else if (alignBetweenTopMatchId && alignBetweenBottomMatchId) {
        const topMatch = gridEl.querySelector(
          `article[${MATCH_ID_ATTR}="${CSS.escape(alignBetweenTopMatchId)}"]`,
        );
        const bottomMatch = gridEl.querySelector(
          `article[${MATCH_ID_ATTR}="${CSS.escape(alignBetweenBottomMatchId)}"]`,
        );
        if (!topMatch || !bottomMatch) return;
        targetCenter = (matchCenterY(topMatch) + matchCenterY(bottomMatch)) / 2;
      } else if (alignToMatchId) {
        const refMatch = gridEl.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(alignToMatchId)}"]`);
        if (!refMatch) return;
        targetCenter = matchCenterY(refMatch);
      } else {
        return;
      }

      const selfMatch =
        wrap.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(CLASSIC_DE_CHAMPION_SLOT_MATCH_ID)}"]`) ??
        wrap.querySelector("article");
      if (!selfMatch) return;

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
    const observeIds = [
      alignToMatchId,
      alignBetweenTopMatchId,
      alignBetweenBottomMatchId,
      CLASSIC_DE_CHAMPION_SLOT_MATCH_ID,
    ].filter((id): id is string => Boolean(id));
    for (const id of observeIds) {
      const match = gridEl?.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(id)}"]`);
      if (match) ro.observe(match);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [alignBetweenBottomMatchId, alignBetweenTopMatchId, alignToBracketMidline, alignToMatchId]);

  const wrapClass = [styles.gridMatchWrap, wrapClassName].filter(Boolean).join(" ");

  return (
    <div
      ref={wrapRef}
      className={wrapClass}
      style={{ gridColumn: col, gridRow: `${row} / span ${span}` }}
    >
      <div
        className={styles.classicDoubleElimGrandFinalInner}
        style={{
          ...(topPx != null ? { top: topPx } : {}),
          ...visualOffsetStyle(offset),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Pin G8 so its card center sits on the midpoint between G4 and G7. LOCKED — do not replace with static grid rows. */
function ClassicGrandFinalCell({
  placement,
  topMatchId,
  bottomMatchId,
  selfMatchId,
  alignToBracketMidline = false,
  offset = { xPx: 0, yPx: 0 },
  children,
}: {
  placement: ClassicGridPlacement;
  topMatchId: string;
  bottomMatchId: string;
  selfMatchId: string;
  alignToBracketMidline?: boolean;
  offset?: BracketVisualOffset;
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
      const targetCenter = alignToBracketMidline
        ? (wrapRect.top + wrapRect.bottom) / 2
        : (matchCenterY(topMatch) + matchCenterY(bottomMatch)) / 2;
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
  }, [alignToBracketMidline, bottomMatchId, selfMatchId, topMatchId]);

  return (
    <div
      ref={wrapRef}
      className={`${styles.gridMatchWrap} ${styles.classicDoubleElimGrandFinalWrap}`}
      style={{ gridColumn: col, gridRow: `${row} / span ${span}` }}
    >
      <div
        className={styles.classicDoubleElimGrandFinalInner}
        style={{
          ...(topPx != null ? { top: topPx } : {}),
          ...visualOffsetStyle(offset),
        }}
      >
        {children}
      </div>
    </div>
  );
}

function connCell(
  key: string,
  { col, row, span }: ClassicGridPlacement,
  content: ReactNode,
  dataBracketConn?: string,
  offset: BracketVisualOffset = { xPx: 0, yPx: 0 },
): ReactNode {
  return (
    <div
      key={key}
      className={styles.connectorCell}
      style={{ gridColumn: col, gridRow: `${row} / span ${span}`, ...visualOffsetStyle(offset) }}
      {...(dataBracketConn ? { "data-bracket-conn": dataBracketConn } : {})}
    >
      {content}
    </div>
  );
}

/** Pin G9 so its top-center sits under the G8→champion gutter drop line. */
export function ClassicIfNecessaryMatchCell({
  placement,
  dropLineConnKey,
  matchId,
  widthMatchId,
  offset = { xPx: 0, yPx: 0 },
  children,
}: {
  placement: ClassicGridPlacement;
  dropLineConnKey: string;
  matchId: string;
  widthMatchId: string;
  offset?: BracketVisualOffset;
  children: ReactNode;
}) {
  const { col, row, span } = placement;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [frameStyle, setFrameStyle] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const gridEl = wrap.closest(`.${styles.classicDoubleElimGrid}`);
      if (!gridEl) return;

      const connCell = gridEl.querySelector(`[data-bracket-conn="${CSS.escape(dropLineConnKey)}"]`);
      const matchEl = wrap.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(matchId)}"]`);
      const widthRef = gridEl.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(widthMatchId)}"]`);
      if (!connCell || !matchEl) return;

      const wrapRect = wrap.getBoundingClientRect();
      const connRect = connCell.getBoundingClientRect();
      const cardWidth = widthRef?.getBoundingClientRect().width ?? matchEl.getBoundingClientRect().width;
      if (cardWidth <= 0) return;

      const dropCenterX = (connRect.left + connRect.right) / 2;
      setFrameStyle({
        left: `${dropCenterX - wrapRect.left - cardWidth / 2}px`,
        width: `${cardWidth}px`,
      });
    };

    measure();
    const raf = window.requestAnimationFrame(measure);
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(measure));
    const ro = new ResizeObserver(measure);
    const wrap = wrapRef.current;
    if (wrap) ro.observe(wrap);
    const gridEl = wrap?.closest(`.${styles.classicDoubleElimGrid}`);
    const connCell = gridEl?.querySelector(`[data-bracket-conn="${CSS.escape(dropLineConnKey)}"]`);
    if (connCell) ro.observe(connCell);
    for (const id of [matchId, widthMatchId]) {
      const match = gridEl?.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(id)}"]`);
      if (match) ro.observe(match);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [dropLineConnKey, matchId, widthMatchId]);

  return (
    <div
      ref={wrapRef}
      className={`${styles.gridMatchWrap} ${styles.classicDoubleElimIfNecessaryWrap}`}
      style={{ gridColumn: col, gridRow: `${row} / span ${span}` }}
    >
      <div
        className={styles.classicDoubleElimIfNecessaryInner}
        style={{ ...(frameStyle ?? {}), ...visualOffsetStyle(offset) }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Classic double-elimination diagram with halving-bracket lane geometry.
 * LOCKED — see {@link DOUBLE_ELIMINATION_CLASSIC_LAYOUT_TEMPLATE}; scores/labels only.
 */
export default function ClassicDoubleElimDiagram({
  slots,
  tournamentInfo,
  visualTuning,
  championPodium,
  renderMatch,
  scoring,
  liveGameStatuses,
  onMatchClick,
  gameChangerEnabled,
  fluidWidth = false,
}: Props) {
  const [g1, g2] = slots.openers;
  const g3 = slots.winnersSemi;
  const g4 = slots.winnersFinal;
  const g5 = slots.losersRound1;
  const g6 = slots.losersCrossover;
  const g7 = slots.losersFinal;
  const g8 = slots.grandFinal;
  const g9 = slots.ifNecessary;
  const championshipSeries = slots.championshipSeries ?? [];
  const championshipSeriesTarget = championshipSeries[1] ?? championshipSeries[0] ?? null;
  const finalTarget = g8 ?? championshipSeriesTarget;
  const isThreeGameChampionshipSeries = championshipSeries.length > 0;
  const losersRound1Placement = isThreeGameChampionshipSeries ? grid.g6 : grid.g5;
  const losersFinalPlacement = isThreeGameChampionshipSeries ? grid.g7 : g6 ? grid.g7 : grid.g6;
  const losersConnectorPlacement = isThreeGameChampionshipSeries ? grid.connG6G7 : grid.connG5G6;

  const showChampionColumn = Boolean(championPodium && !championshipSeriesTarget && g8);
  const showIfNecessaryGame = Boolean(championPodium?.showIfNecessaryDropLine && g9);
  const gameOffset = (key: string) => visualTuningOffset(visualTuning, "games", key);
  const connectorOffset = (key: string) => visualTuningOffset(visualTuning, "connectors", key);
  const championConnectorOffset = connectorOffset("g8-champion");
  const anchorY = CLASSIC_DE_CONNECTOR_ANCHOR;

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

  const matchProps = { scoring, liveGameStatuses, onMatchClick, gameChangerEnabled };
  const render = (match: LayoutMatch) => renderMatch({ match, ...matchProps });

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
        {matchCell("g1", grid.g1, render(g1), undefined, gameOffset("G1"))}
        {fillerCell("winners-r1-bot", grid.winnersR1Bot)}

        {connCell(
          "c-g1-g3",
          grid.connG1G3,
          <BracketConnectorCell
            variant="top"
            anchorY={anchorY}
            topMatchId={g1.id}
            targetMatchId={g3.id}
          />,
          undefined,
          connectorOffset("g1-g3"),
        )}
        {matchCell("g3", grid.g3, render(g3), undefined, gameOffset("G3"))}
        {matchCell("g2", grid.g2, render(g2), undefined, gameOffset("G2"))}
        {connCell(
          "c-winners-g4",
          grid.connWinnersG4,
          <BracketConnectorCell
            variant="both"
            anchorY={anchorY}
            topMatchId={g2.id}
            bottomMatchId={g3.id}
            targetMatchId={g4.id}
          />,
          undefined,
          connectorOffset("winners-g4"),
        )}
        {matchCell("g4", grid.g4, render(g4), undefined, gameOffset("G4"))}

        {fillerCell("band-gap", bandGapPlacement, styles.classicDoubleElimBandGap)}

        {matchCell("g5", losersRound1Placement, render(g5), undefined, gameOffset("G5"))}
        {connCell(
          "c-g5-g6",
          losersConnectorPlacement,
          <BracketConnectorCell
            variant="top"
            anchorY={anchorY}
            topMatchId={g5.id}
            targetMatchId={(g6 ?? g7).id}
          />,
          undefined,
          connectorOffset("g5-g6"),
        )}
        {g6 ? (
          <>
            {matchCell("g6", grid.g6, render(g6), undefined, gameOffset("G6"))}
            {connCell(
              "c-g6-g7",
              grid.connG6G7,
              <BracketConnectorCell
                variant="top"
                anchorY={anchorY}
                topMatchId={g6.id}
                targetMatchId={g7.id}
              />,
              undefined,
              connectorOffset("g6-g7"),
            )}
          </>
        ) : null}
        {matchCell("g7", losersFinalPlacement, render(g7), undefined, gameOffset("G7"))}

        {finalTarget
          ? connCell(
              "c-finals-g8",
              grid.connFinalsG8,
              <BracketConnectorCell
                variant="both"
                anchorY={anchorY}
                topMatchId={g4.id}
                bottomMatchId={g7.id}
                targetMatchId={finalTarget.id}
              />,
              undefined,
              connectorOffset("finals-g8"),
            )
          : null}

        {g8 ? (
          <ClassicGrandFinalCell
            placement={grid.g8}
            topMatchId={g4.id}
            bottomMatchId={g7.id}
            selfMatchId={g8.id}
            offset={gameOffset("G8")}
          >
            {render(g8)}
          </ClassicGrandFinalCell>
        ) : championshipSeriesTarget ? (
          <ClassicGrandFinalCell
            placement={grid.g8}
            topMatchId={g4.id}
            bottomMatchId={g7.id}
            selfMatchId={championshipSeriesTarget.id}
            offset={gameOffset("G8")}
          >
            <div className={styles.classicDoubleElimChampionshipSeriesStack}>
              <p className={styles.classicDoubleElimChampionshipSeriesLabel}>Championship Series</p>
              {championshipSeries.map((match) => (
                <div key={match.id}>{render(match)}</div>
              ))}
            </div>
          </ClassicGrandFinalCell>
        ) : null}

        {showChampionColumn && championPodium && g8 ? (
          <>
            {connCell(
              "c-g8-champion",
              grid.connG8Champion,
              <>
                <BracketHorizontalGutterConnector
                  sourceMatchId={g8.id}
                  targetMatchId={CLASSIC_DE_CHAMPION_SLOT_MATCH_ID}
                  anchorY={anchorY}
                  yOffsetPx={championConnectorOffset.yPx}
                />
                {championPodium.showIfNecessaryDropLine ? (
                  <BracketIfNecessaryDropConnector
                    sourceMatchId={g8.id}
                    targetMatchId={CLASSIC_DE_CHAMPION_SLOT_MATCH_ID}
                    ifNecessaryMatchId={g9?.id}
                    anchorY={anchorY}
                    yOffsetPx={championConnectorOffset.yPx}
                  />
                ) : null}
              </>,
              "g8-champion",
              { xPx: championConnectorOffset.xPx, yPx: 0 },
            )}
            {showIfNecessaryGame && g9 ? (
              <ClassicIfNecessaryMatchCell
                placement={grid.g9}
                dropLineConnKey="g8-champion"
                matchId={g9.id}
                widthMatchId={g8.id}
                offset={gameOffset("G9")}
              >
                {render(g9)}
              </ClassicIfNecessaryMatchCell>
            ) : null}
            <ClassicAlignedToMatchCell
              placement={grid.champion}
              alignToMatchId={g8.id}
              wrapClassName={styles.classicDoubleElimChampionWrap}
              offset={gameOffset("Champion")}
            >
              <ClassicDoubleElimChampionPlaque
                heading={championPodium.championHeading}
                teamName={championPodium.championTeamName}
              />
            </ClassicAlignedToMatchCell>
          </>
        ) : null}
      </div>
    </div>
  );
}
