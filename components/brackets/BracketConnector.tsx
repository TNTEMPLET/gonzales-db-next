"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import {
  BRACKET_PODIUM_CHAMPION_SOURCE_ATTR,
  BRACKET_PODIUM_CHAMPION_TARGET_ATTR,
  BRACKET_PODIUM_THIRD_SOURCE_ATTR,
  BRACKET_PODIUM_THIRD_TARGET_ATTR,
  bracketConnectorBothFromSize,
  bracketConnectorCenterFeederFromSize,
  bracketConnectorHorizontalAtPercentFromSize,
  bracketConnectorSingleFromSize,
  bracketConnectorYPercentForCenter,
  type BracketConnectorVariant,
} from "@/lib/tournament-brackets/bracketConnectorPaths";

import styles from "@/components/brackets/TournamentBracketView.module.css";

const PATH_STROKE = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const MATCH_ID_ATTR = "data-bracket-match-id";
const PODIUM_THIRD_ALIGN_EVENT = "bracket:podium-third-align";

function bracketConnectorMeasuredLineFromSize(
  widthPx: number,
  heightPx: number,
  sourceYPercent: number,
  targetYPercent: number,
  clampY = true,
): { viewBox: string; d: string } {
  const w = Math.max(4, widthPx);
  const h = Math.max(4, heightPx);
  const vbH = (40 * h) / w;
  const s = vbH / 100;
  const yv = (v: number) => (clampY ? Math.max(2, Math.min(98, v)) : v) * s;
  const d = `M 2 ${yv(sourceYPercent)} L 38 ${yv(targetYPercent)}`;
  return { viewBox: `0 0 40 ${vbH}`, d };
}

function bracketConnectorMeasuredFeedersFromSize({
  widthPx,
  heightPx,
  sourceYPercents,
  targetYPercent,
}: {
  widthPx: number;
  heightPx: number;
  sourceYPercents: number[];
  targetYPercent: number;
}): { viewBox: string; d: string } {
  const w = Math.max(4, widthPx);
  const h = Math.max(4, heightPx);
  const vbH = (40 * h) / w;
  const s = vbH / 100;
  const yv = (v: number) => Math.max(2, Math.min(98, v)) * s;
  const target = yv(targetYPercent);
  const d = sourceYPercents
    .map((sourceY) => {
      const source = yv(sourceY);
      return `M 2 ${source} L 20 ${source} L 20 ${target} L 38 ${target}`;
    })
    .join(" ");
  return { viewBox: `0 0 40 ${vbH}`, d };
}

function visualToLayoutScale(el: HTMLElement, rect: DOMRect): number {
  const layoutHeight = el.offsetHeight;
  if (layoutHeight <= 0 || rect.height <= 0) return 1;
  return rect.height / layoutHeight;
}

function useConnectorCellRect(wrapRef: React.RefObject<HTMLDivElement | null>) {
  return () => {
    const el = wrapRef.current;
    const cell = el?.parentElement;
    if (!el || !cell) return null;
    const cr = cell.getBoundingClientRect();
    const w = cr.width;
    const h = cr.height;
    if (w < 2 || h < 2) return null;
    return { top: cr.top, height: h, width: w };
  };
}

function connectorScope(cell: Element): Element {
  return cell.closest(`.${styles.desktopBracketDiagram}`) ?? cell.closest("section") ?? cell;
}

function matchById(scope: Element | null, id?: string): Element | null {
  if (!scope || !id) return null;
  return scope.querySelector(`[${MATCH_ID_ATTR}="${CSS.escape(id)}"]`);
}

function useFinalPodiumHubYPercent(
  wrapRef: React.RefObject<HTMLDivElement | null>,
  feedsFinalPodiumMatch: boolean,
): number {
  const [hubY, setHubY] = useState(50);
  const getCell = useConnectorCellRect(wrapRef);

  useLayoutEffect(() => {
    if (!feedsFinalPodiumMatch) {
      const id = window.requestAnimationFrame(() => setHubY(50));
      return () => window.cancelAnimationFrame(id);
    }
    const measure = () => {
      const cell = getCell();
      if (!cell) return;
      const root = wrapRef.current ? connectorScope(wrapRef.current) : null;
      const match = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
      if (!match) {
        setHubY(50);
        return;
      }
      const mr = match.getBoundingClientRect();
      setHubY(bracketConnectorYPercentForCenter(cell.top, cell.height, (mr.top + mr.bottom) / 2));
    };
    measure();
    const ro = new ResizeObserver(measure);
    const el = wrapRef.current;
    if (el?.parentElement) ro.observe(el.parentElement);
    const root = el ? connectorScope(el) : null;
    const match = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
    if (match) ro.observe(match);
    return () => ro.disconnect();
  }, [feedsFinalPodiumMatch, getCell, wrapRef]);

  return hubY;
}

function MeasuredFeedersConnector({
  variant,
  topMatchId,
  bottomMatchId,
  targetMatchId,
  feedsFinalPodiumMatch = false,
}: {
  variant: Exclude<BracketConnectorVariant, "none" | "center">;
  topMatchId?: string;
  bottomMatchId?: string;
  targetMatchId?: string;
  feedsFinalPodiumMatch?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fallbackHubY = useFinalPodiumHubYPercent(wrapRef, feedsFinalPodiumMatch);
  const [{ viewBox, d }, setGeom] = useState(() =>
    variant === "both"
      ? bracketConnectorBothFromSize(40, 100, fallbackHubY)
      : bracketConnectorSingleFromSize(40, 100, variant, fallbackHubY),
  );

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const pr = el.parentElement?.getBoundingClientRect();
      const cr = el.getBoundingClientRect();
      const w = Math.max(cr.width, pr?.width ?? 0);
      const h = Math.max(cr.height, pr?.height ?? 0);
      if (w < 2 || h < 2) return;

      const scope = connectorScope(el);
      const cellTop = cr.top;
      const cellHeight = cr.height;
      const sourceIds =
        variant === "both"
          ? [topMatchId, bottomMatchId].filter((id): id is string => Boolean(id))
          : [variant === "top" ? topMatchId : bottomMatchId].filter((id): id is string => Boolean(id));
      const sources = sourceIds.map((id) => matchById(scope, id)).filter((node): node is Element => Boolean(node));
      const target = matchById(scope, targetMatchId);

      if (sources.length > 0 && target) {
        const sourceYPercents = sources.map((source) => {
          const rect = source.getBoundingClientRect();
          return bracketConnectorYPercentForCenter(cellTop, cellHeight, (rect.top + rect.bottom) / 2);
        });
        const targetRect = target.getBoundingClientRect();
        const targetYPercent = bracketConnectorYPercentForCenter(
          cellTop,
          cellHeight,
          (targetRect.top + targetRect.bottom) / 2,
        );
        setGeom(bracketConnectorMeasuredFeedersFromSize({ widthPx: w, heightPx: h, sourceYPercents, targetYPercent }));
        return;
      }

      setGeom(
        variant === "both"
          ? bracketConnectorBothFromSize(w, h, fallbackHubY)
          : bracketConnectorSingleFromSize(w, h, variant, fallbackHubY),
      );
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const scope = connectorScope(el);
    for (const id of [topMatchId, bottomMatchId, targetMatchId]) {
      const match = matchById(scope, id);
      if (match) ro.observe(match);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [bottomMatchId, fallbackHubY, feedsFinalPodiumMatch, targetMatchId, topMatchId, variant]);

  return (
    <div ref={wrapRef} className={styles.connectorDynamicWrap} aria-hidden>
      <svg
        className={styles.connectorSvgDynamic}
        viewBox={viewBox}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        <path d={d} {...PATH_STROKE} />
      </svg>
    </div>
  );
}

/** 3rd-place game -> 3rd-place plaque: line anchored to the rendered center of each card. */
function PodiumThirdConnector() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [{ viewBox, d, frameStyle }, setGeom] = useState<{
    viewBox: string;
    d: string;
    frameStyle?: CSSProperties;
  }>(() => bracketConnectorHorizontalAtPercentFromSize(40, 100, 85));

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const stack = el.parentElement;
      const cell = stack?.parentElement;
      if (!stack || !cell) return;
      const cr = cell.getBoundingClientRect();
      const w = cr.width;
      const h = cr.height;
      if (w < 2 || h < 2) return;
      const root = connectorScope(cell);
      const source = root?.querySelector(`[${BRACKET_PODIUM_THIRD_SOURCE_ATTR}]`);
      const target = root?.querySelector(`[${BRACKET_PODIUM_THIRD_TARGET_ATTR}]`);
      if (source && target) {
        const sr = source.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        const frameTop = sr.top;
        const frameHeight = Math.max(4, sr.height);
        const visualScale = visualToLayoutScale(cell as HTMLElement, cr);
        const cssTop = visualScale > 0 ? (frameTop - cr.top) / visualScale : frameTop - cr.top;
        const cssHeight = visualScale > 0 ? frameHeight / visualScale : frameHeight;
        const sourceYPercent = bracketConnectorYPercentForCenter(
          frameTop,
          frameHeight,
          (sr.top + sr.bottom) / 2,
        );
        const targetYPercent = bracketConnectorYPercentForCenter(
          frameTop,
          frameHeight,
          (tr.top + tr.bottom) / 2,
        );
        setGeom({
          ...bracketConnectorMeasuredLineFromSize(w, frameHeight, sourceYPercent, targetYPercent, false),
          frameStyle: {
            top: `${cssTop}px`,
            bottom: "auto",
            height: `${cssHeight}px`,
            minHeight: `${cssHeight}px`,
          },
        });
        return;
      }
      setGeom(bracketConnectorHorizontalAtPercentFromSize(w, h, 85));
    };
    measure();
    let raf2: number | undefined;
    const raf = window.requestAnimationFrame(() => {
      measure();
      raf2 = window.requestAnimationFrame(measure);
    });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const cell = el.parentElement?.parentElement;
    if (cell) ro.observe(cell);
    const root = cell ? connectorScope(cell) : null;
    const source = root?.querySelector(`[${BRACKET_PODIUM_THIRD_SOURCE_ATTR}]`);
    const target = root?.querySelector(`[${BRACKET_PODIUM_THIRD_TARGET_ATTR}]`);
    if (source) ro.observe(source);
    if (target) ro.observe(target);
    root?.addEventListener(PODIUM_THIRD_ALIGN_EVENT, measure);
    return () => {
      window.cancelAnimationFrame(raf);
      if (raf2 != null) window.cancelAnimationFrame(raf2);
      root?.removeEventListener(PODIUM_THIRD_ALIGN_EVENT, measure);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={styles.connectorDynamicWrap}
      style={frameStyle}
      data-bracket-connector="podium-third"
      aria-hidden
    >
      <svg
        className={styles.connectorSvgDynamic}
        viewBox={viewBox}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        <path d={d} {...PATH_STROKE} />
      </svg>
    </div>
  );
}

/** Final match → champion plaque (Final → Champion gutter only). */
function PodiumChampionConnector() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [{ viewBox, d, frameStyle }, setGeom] = useState<{
    viewBox: string;
    d: string;
    frameStyle?: CSSProperties;
  }>(() => bracketConnectorHorizontalAtPercentFromSize(40, 100, 50));

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const stack = el.parentElement;
      const cell = stack?.parentElement;
      if (!stack || !cell) return;
      const cr = cell.getBoundingClientRect();
      const w = cr.width;
      const h = cr.height;
      if (w < 2 || h < 2) return;
      const root = connectorScope(cell);
      const source = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
      const target = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_TARGET_ATTR}]`);
      if (source && target) {
        const sr = source.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        const sourceCenter = (sr.top + sr.bottom) / 2;
        const targetCenter = (tr.top + tr.bottom) / 2;
        const frameTop = Math.min(sourceCenter, targetCenter) - 2;
        const frameHeight = Math.max(4, Math.abs(targetCenter - sourceCenter) + 4);
        const visualScale = visualToLayoutScale(cell as HTMLElement, cr);
        const cssTop = visualScale > 0 ? (frameTop - cr.top) / visualScale : frameTop - cr.top;
        const cssHeight = visualScale > 0 ? frameHeight / visualScale : frameHeight;
        const sourceYPercent = bracketConnectorYPercentForCenter(
          frameTop,
          frameHeight,
          sourceCenter,
        );
        const targetYPercent = bracketConnectorYPercentForCenter(
          frameTop,
          frameHeight,
          targetCenter,
        );
        setGeom({
          ...bracketConnectorMeasuredLineFromSize(w, frameHeight, sourceYPercent, targetYPercent, false),
          frameStyle: {
            top: `${cssTop}px`,
            bottom: "auto",
            height: `${cssHeight}px`,
            minHeight: `${cssHeight}px`,
          },
        });
        return;
      } else {
        setGeom({ ...bracketConnectorCenterFeederFromSize(w, h), frameStyle: undefined });
        return;
      }
    };
    measure();
    let raf2: number | undefined;
    const raf = window.requestAnimationFrame(() => {
      measure();
      raf2 = window.requestAnimationFrame(measure);
    });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const cell = el.parentElement?.parentElement;
    if (cell) ro.observe(cell);
    const root = cell ? connectorScope(cell) : null;
    const source = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
    const target = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_TARGET_ATTR}]`);
    if (source) ro.observe(source);
    if (target) ro.observe(target);
    return () => {
      window.cancelAnimationFrame(raf);
      if (raf2 != null) window.cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={styles.connectorDynamicWrap}
      style={frameStyle}
      data-bracket-connector="center"
      aria-hidden
    >
      <svg
        className={styles.connectorSvgDynamic}
        viewBox={viewBox}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        <path d={d} {...PATH_STROKE} />
      </svg>
    </div>
  );
}

/** Single-feeder gutter: horizontal at 50% (not the champion plaque pair). */
function RoundCenterConnector({ feedsFinalPodiumMatch = false }: { feedsFinalPodiumMatch?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hubY = useFinalPodiumHubYPercent(wrapRef, feedsFinalPodiumMatch);
  const [{ viewBox, d }, setGeom] = useState(() =>
    bracketConnectorHorizontalAtPercentFromSize(40, 100, hubY),
  );

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const pr = el.parentElement?.getBoundingClientRect();
      const cr = el.getBoundingClientRect();
      const w = Math.max(cr.width, pr?.width ?? 0);
      const h = Math.max(cr.height, pr?.height ?? 0);
      if (w < 2 || h < 2) return;
      setGeom(bracketConnectorHorizontalAtPercentFromSize(w, h, hubY));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const root = connectorScope(el);
    const match = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
    if (match) ro.observe(match);
    return () => ro.disconnect();
  }, [hubY]);

  return (
    <div ref={wrapRef} className={styles.connectorDynamicWrap} data-bracket-connector="center" aria-hidden>
      <svg
        className={styles.connectorSvgDynamic}
        viewBox={viewBox}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        <path d={d} {...PATH_STROKE} />
      </svg>
    </div>
  );
}

/** Champion + 3rd-place horizontal traces in the Final → Champion gutter. */
export function FinalChampionConnectorCell() {
  return (
    <div className={styles.connectorCellPodiumStack}>
      <PodiumChampionConnector />
      <PodiumThirdConnector />
    </div>
  );
}

/** SVG for one connector gutter between two rounds. */
export function BracketConnectorCell({
  variant,
  feedsFinalPodiumMatch = false,
  topMatchId,
  bottomMatchId,
  targetMatchId,
}: {
  variant: BracketConnectorVariant;
  /** Gutter feeds the final column when podium layout splits championship + 3rd-place bands. */
  feedsFinalPodiumMatch?: boolean;
  topMatchId?: string;
  bottomMatchId?: string;
  targetMatchId?: string;
}) {
  if (variant === "both") {
    return (
      <MeasuredFeedersConnector
        variant="both"
        feedsFinalPodiumMatch={feedsFinalPodiumMatch}
        topMatchId={topMatchId}
        bottomMatchId={bottomMatchId}
        targetMatchId={targetMatchId}
      />
    );
  }
  if (variant === "center") {
    return <RoundCenterConnector feedsFinalPodiumMatch={feedsFinalPodiumMatch} />;
  }
  if (variant === "top" || variant === "bottom") {
    return (
      <MeasuredFeedersConnector
        variant={variant}
        feedsFinalPodiumMatch={feedsFinalPodiumMatch}
        topMatchId={topMatchId}
        bottomMatchId={bottomMatchId}
        targetMatchId={targetMatchId}
      />
    );
  }
  return <div className={styles.connectorDynamicWrap} aria-hidden />;
}
