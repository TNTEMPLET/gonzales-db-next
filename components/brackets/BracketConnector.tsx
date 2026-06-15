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
  bracketConnectorVerticalLineFullHeightFromSize,
  bracketConnectorSingleFromSize,
  bracketConnectorYPercentForCenter,
  bracketConnectorRouteCornerInFromSize,
  bracketConnectorHorizontalAtYFromSize,
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

const PATH_STROKE_DASHED = {
  ...PATH_STROKE,
  strokeDasharray: "5 5",
};

/** Fixed 2px stroke for if-necessary overlay SVGs (wide horizontal spans must not scale stroke up). */
const PATH_STROKE_IF_NECESSARY = {
  ...PATH_STROKE,
  vectorEffect: "non-scaling-stroke" as const,
};

const PATH_STROKE_DASHED_IF_NECESSARY = {
  ...PATH_STROKE_IF_NECESSARY,
  strokeDasharray: "5 5",
};

const CONNECTOR_BAND_PX = 4;

const MATCH_ID_ATTR = "data-bracket-match-id";
const MATCH_SLOT_ATTR = "data-bracket-match-slot";
const PODIUM_THIRD_ALIGN_EVENT = "bracket:podium-third-align";

export const BRACKET_VIA_BAND_ATTR = "data-bracket-via-band";

export type BracketConnectorTargetSlot = "home" | "away";

export type BracketConnectorAnchor = "match" | "slot";

function matchSlotCenterY(el: Element, slot: BracketConnectorTargetSlot): number | null {
  const row = el.querySelector(`[${MATCH_SLOT_ATTR}="${slot}"]`);
  if (!row) return null;
  const rect = row.getBoundingClientRect();
  return (rect.top + rect.bottom) / 2;
}

function matchAnchorCenterY(
  el: Element,
  anchor: BracketConnectorAnchor,
  targetSlot?: BracketConnectorTargetSlot,
): number {
  if (targetSlot) {
    const slotY = matchSlotCenterY(el, targetSlot);
    if (slotY != null) return slotY;
  }
  const rect = el.getBoundingClientRect();
  if (anchor === "match") return (rect.top + rect.bottom) / 2;
  const home = el.querySelector(`[${MATCH_SLOT_ATTR}="home"]`);
  const away = el.querySelector(`[${MATCH_SLOT_ATTR}="away"]`);
  if (home && away) {
    const hr = home.getBoundingClientRect();
    const ar = away.getBoundingClientRect();
    return (hr.top + ar.bottom) / 2;
  }
  return (rect.top + rect.bottom) / 2;
}

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
  return (
    cell.closest(`.${styles.classicDoubleElimGrid}`) ??
    cell.closest(`.${styles.desktopBracketDiagram}`) ??
    cell.closest("section") ??
    cell
  );
}

function matchById(scope: Element | null, id?: string): Element | null {
  if (!scope || !id) return null;
  return scope.querySelector(`article[${MATCH_ID_ATTR}="${CSS.escape(id)}"]`);
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
  anchorY = "match",
}: {
  variant: Exclude<BracketConnectorVariant, "none" | "center">;
  topMatchId?: string;
  bottomMatchId?: string;
  targetMatchId?: string;
  feedsFinalPodiumMatch?: boolean;
  anchorY?: BracketConnectorAnchor;
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
      const cell = el.parentElement;
      const cr = cell?.getBoundingClientRect() ?? el.getBoundingClientRect();
      const w = Math.max(cr.width, el.getBoundingClientRect().width);
      const h = Math.max(cr.height, el.getBoundingClientRect().height);
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
          return bracketConnectorYPercentForCenter(
            cellTop,
            cellHeight,
            matchAnchorCenterY(source, anchorY),
          );
        });
        const targetYPercent = bracketConnectorYPercentForCenter(
          cellTop,
          cellHeight,
          matchAnchorCenterY(target, anchorY),
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
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(measure));
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
      window.cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [anchorY, bottomMatchId, fallbackHubY, feedsFinalPodiumMatch, targetMatchId, topMatchId, variant]);

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

/** G2 row: horizontal trace at source match Y (col-2 outbound leg). */
export function BracketG2RouteOutConnector({
  sourceMatchId,
  anchorY = "match",
}: {
  sourceMatchId: string;
  anchorY?: BracketConnectorAnchor;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [{ viewBox, d }, setGeom] = useState(() =>
    bracketConnectorHorizontalAtYFromSize(40, 100, 50),
  );

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const cell = el.parentElement;
      const cr = cell?.getBoundingClientRect() ?? el.getBoundingClientRect();
      const w = Math.max(cr.width, el.getBoundingClientRect().width);
      const h = Math.max(cr.height, el.getBoundingClientRect().height);
      if (w < 2 || h < 2) return;
      const scope = connectorScope(el);
      const source = matchById(scope, sourceMatchId);
      if (!source) return;
      const sourceY = bracketConnectorYPercentForCenter(
        cr.top,
        cr.height,
        matchAnchorCenterY(source, anchorY),
      );
      setGeom(bracketConnectorHorizontalAtYFromSize(w, h, sourceY));
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const scope = connectorScope(el);
    const source = matchById(scope, sourceMatchId);
    if (source) ro.observe(source);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [anchorY, sourceMatchId]);

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

/** G2 row: horizontal passthrough below G3 (col-3). */
export function BracketG2RouteThruConnector({
  sourceMatchId,
  anchorY = "match",
}: {
  sourceMatchId: string;
  anchorY?: BracketConnectorAnchor;
}) {
  return (
    <BracketG2RouteOutConnector sourceMatchId={sourceMatchId} anchorY={anchorY} />
  );
}

/** G2 row → G4 W2: corner up from entry Y into away slot (col-4 inbound leg). */
export function BracketG2RouteInConnector({
  sourceMatchId,
  targetMatchId,
  targetSlot = "away",
  anchorY = "match",
}: {
  sourceMatchId: string;
  targetMatchId: string;
  targetSlot?: BracketConnectorTargetSlot;
  anchorY?: BracketConnectorAnchor;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [{ viewBox, d }, setGeom] = useState(() =>
    bracketConnectorRouteCornerInFromSize(40, 100, 75, 40),
  );

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const cell = el.parentElement;
      const cr = cell?.getBoundingClientRect() ?? el.getBoundingClientRect();
      const w = Math.max(cr.width, el.getBoundingClientRect().width);
      const h = Math.max(cr.height, el.getBoundingClientRect().height);
      if (w < 2 || h < 2) return;
      const scope = connectorScope(el);
      const source = matchById(scope, sourceMatchId);
      const target = matchById(scope, targetMatchId);
      if (!source || !target) return;
      const cellTop = cr.top;
      const cellHeight = cr.height;
      const entryY = bracketConnectorYPercentForCenter(
        cellTop,
        cellHeight,
        matchAnchorCenterY(source, anchorY),
      );
      const targetY = bracketConnectorYPercentForCenter(
        cellTop,
        cellHeight,
        matchAnchorCenterY(target, anchorY, targetSlot),
      );
      setGeom(bracketConnectorRouteCornerInFromSize(w, h, entryY, targetY));
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const scope = connectorScope(el);
    const source = matchById(scope, sourceMatchId);
    const target = matchById(scope, targetMatchId);
    if (source) ro.observe(source);
    if (target) ro.observe(target);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [anchorY, sourceMatchId, targetMatchId, targetSlot]);

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

/** Straight horizontal link between two side-by-side matches (same-row gutter). */
export function BracketHorizontalGutterConnector({
  sourceMatchId,
  targetMatchId,
  anchorY = "match",
}: {
  sourceMatchId: string;
  targetMatchId: string;
  anchorY?: BracketConnectorAnchor;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [{ viewBox, d, frameStyle }, setGeom] = useState<{
    viewBox: string;
    d: string;
    frameStyle?: CSSProperties;
  }>(() => ({
    ...bracketConnectorHorizontalAtPercentFromSize(40, 100, 50),
    frameStyle: undefined,
  }));

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const cell = el.parentElement;
      if (!cell) return;
      const cr = cell.getBoundingClientRect();
      const w = cr.width;
      const h = cr.height;
      if (w < 2 || h < 2) return;
      const scope = connectorScope(cell);
      const source = matchById(scope, sourceMatchId);
      const target = matchById(scope, targetMatchId);
      if (!source || !target) return;

      const sourceCenter = matchAnchorCenterY(source, anchorY);
      const targetCenter = matchAnchorCenterY(target, anchorY);
      const midCenter = (sourceCenter + targetCenter) / 2;
      const frameTop = midCenter - 2;
      const frameHeight = 4;
      const visualScale = visualToLayoutScale(cell as HTMLElement, cr);
      const cssTop = visualScale > 0 ? (frameTop - cr.top) / visualScale : frameTop - cr.top;
      const cssHeight = visualScale > 0 ? frameHeight / visualScale : frameHeight;
      setGeom({
        ...bracketConnectorHorizontalAtPercentFromSize(w, frameHeight, 50),
        frameStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          top: `${cssTop}px`,
          bottom: "auto",
          height: `${cssHeight}px`,
          minHeight: `${cssHeight}px`,
        },
      });
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(measure));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const scope = el.parentElement ? connectorScope(el.parentElement) : null;
    for (const id of [sourceMatchId, targetMatchId]) {
      const match = matchById(scope, id);
      if (match) ro.observe(match);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [anchorY, sourceMatchId, targetMatchId]);

  return (
    <div
      ref={wrapRef}
      className={styles.connectorDynamicWrap}
      style={frameStyle}
      data-bracket-connector="gutter-horizontal"
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

/** Dotted vertical drop from G8→champion connector to G9 (standard DE if-necessary hint). LOCKED geometry. */
export function BracketIfNecessaryDropConnector({
  sourceMatchId,
  targetMatchId,
  ifNecessaryMatchId,
  anchorY = "match",
}: {
  sourceMatchId: string;
  targetMatchId: string;
  /** When set, the vertical drop ends at this match's top edge (G9 top-center junction). */
  ifNecessaryMatchId?: string;
  anchorY?: BracketConnectorAnchor;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropGeom, setDropGeom] = useState<{
    viewBox: string;
    d: string;
    frameStyle?: CSSProperties;
  }>(() => ({
    viewBox: "0 0 40 100",
    d: "M 20 2 L 20 98",
    frameStyle: undefined,
  }));

  useLayoutEffect(() => {
    const measure = () => {
      const cell = dropRef.current?.parentElement;
      if (!cell) return;
      const cr = cell.getBoundingClientRect();
      if (cr.width < 2 || cr.height < 2) return;
      const scope = connectorScope(cell);
      const source = matchById(scope, sourceMatchId);
      const target = matchById(scope, targetMatchId);
      if (!source || !target) return;

      const sourceCenter = matchAnchorCenterY(source, anchorY);
      const targetCenter = matchAnchorCenterY(target, anchorY);
      const midCenterY = (sourceCenter + targetCenter) / 2;
      const ifNecessary = ifNecessaryMatchId ? matchById(scope, ifNecessaryMatchId) : null;
      const ifNecessaryRect = ifNecessary?.getBoundingClientRect();
      const dropBottomY =
        ifNecessaryRect && ifNecessaryRect.height > 0 ? ifNecessaryRect.top : cr.bottom;
      const dropWidth = cr.width;
      const visualScale = visualToLayoutScale(cell as HTMLElement, cr);

      const dropHeight = Math.max(4, dropBottomY - midCenterY);
      const dropTop =
        visualScale > 0 ? (midCenterY - cr.top) / visualScale : midCenterY - cr.top;
      const dropCssHeight = visualScale > 0 ? dropHeight / visualScale : dropHeight;

      setDropGeom({
        ...bracketConnectorVerticalLineFullHeightFromSize(dropWidth, dropHeight),
        frameStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          top: `${dropTop}px`,
          height: `${dropCssHeight}px`,
          minHeight: `${dropCssHeight}px`,
        },
      });
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const raf2 = window.requestAnimationFrame(() => window.requestAnimationFrame(measure));
    const ro = new ResizeObserver(measure);
    const cell = dropRef.current?.parentElement;
    if (cell) ro.observe(cell);
    const scope = cell ? connectorScope(cell) : null;
    for (const id of [sourceMatchId, targetMatchId, ifNecessaryMatchId]) {
      if (!id) continue;
      const match = matchById(scope, id);
      if (match) ro.observe(match);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(raf2);
      ro.disconnect();
    };
  }, [anchorY, ifNecessaryMatchId, sourceMatchId, targetMatchId]);

  return (
    <div
      ref={dropRef}
      className={`${styles.connectorDynamicWrap} ${styles.connectorIfNecessaryDrop}`}
      style={dropGeom.frameStyle}
      data-bracket-connector="if-necessary-drop"
      aria-hidden
    >
      <svg
        className={styles.connectorSvgDynamic}
        viewBox={dropGeom.viewBox}
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        <path d={dropGeom.d} {...PATH_STROKE_DASHED_IF_NECESSARY} />
      </svg>
    </div>
  );
}

/** L-shaped link from one match to another (gutter between columns). */
export function BracketGutterLinkConnector({
  sourceMatchId,
  targetMatchId,
  anchorY = "match",
}: {
  sourceMatchId: string;
  targetMatchId: string;
  anchorY?: BracketConnectorAnchor;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [{ viewBox, d, frameStyle }, setGeom] = useState<{
    viewBox: string;
    d: string;
    frameStyle?: CSSProperties;
  }>(() => ({
    ...bracketConnectorSingleFromSize(40, 100, "bottom"),
    frameStyle: undefined,
  }));

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const cell = el.parentElement;
      if (!cell) return;
      const cr = cell.getBoundingClientRect();
      const w = cr.width;
      const h = cr.height;
      if (w < 2 || h < 2) return;
      const scope = connectorScope(cell);
      const source = matchById(scope, sourceMatchId);
      const target = matchById(scope, targetMatchId);
      if (!source || !target) return;

      const sourceCenter = matchAnchorCenterY(source, anchorY);
      const targetCenter = matchAnchorCenterY(target, anchorY);
      const frameTop = Math.min(sourceCenter, targetCenter) - 2;
      const frameHeight = Math.max(4, Math.abs(targetCenter - sourceCenter) + 4);
      const visualScale = visualToLayoutScale(cell as HTMLElement, cr);
      const cssTop = visualScale > 0 ? (frameTop - cr.top) / visualScale : frameTop - cr.top;
      const cssHeight = visualScale > 0 ? frameHeight / visualScale : frameHeight;
      const sourceYPercent = bracketConnectorYPercentForCenter(frameTop, frameHeight, sourceCenter);
      const targetYPercent = bracketConnectorYPercentForCenter(frameTop, frameHeight, targetCenter);
      const wPx = w;
      const hPx = frameHeight;
      const geom = bracketConnectorMeasuredFeedersFromSize({
        widthPx: wPx,
        heightPx: hPx,
        sourceYPercents: [sourceYPercent],
        targetYPercent,
      });
      setGeom({
        ...geom,
        frameStyle: {
          top: `${cssTop}px`,
          bottom: "auto",
          height: `${cssHeight}px`,
          minHeight: `${cssHeight}px`,
        },
      });
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const scope = el.parentElement ? connectorScope(el.parentElement) : null;
    for (const id of [sourceMatchId, targetMatchId]) {
      const match = matchById(scope, id);
      if (match) ro.observe(match);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [anchorY, sourceMatchId, targetMatchId]);

  return (
    <div
      ref={wrapRef}
      className={styles.connectorDynamicWrap}
      style={frameStyle}
      data-bracket-connector="gutter-link"
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

/** Vertical link between stacked matches in the same column (e.g. Grand Final → If Necessary). */
export function BracketStackLinkConnector({
  sourceMatchId,
  targetMatchId,
  anchorY = "match",
}: {
  sourceMatchId: string;
  targetMatchId: string;
  anchorY?: BracketConnectorAnchor;
}) {
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
      const cell = el.parentElement;
      if (!cell) return;
      const cr = cell.getBoundingClientRect();
      const w = cr.width;
      const h = cr.height;
      if (w < 2 || h < 2) return;
      const scope = connectorScope(cell);
      const source = matchById(scope, sourceMatchId);
      const target = matchById(scope, targetMatchId);
      if (!source || !target) return;

      const sourceCenter = matchAnchorCenterY(source, anchorY);
      const targetCenter = matchAnchorCenterY(target, anchorY);
      const frameTop = Math.min(sourceCenter, targetCenter) - 2;
      const frameHeight = Math.max(4, Math.abs(targetCenter - sourceCenter) + 4);
      const visualScale = visualToLayoutScale(cell as HTMLElement, cr);
      const cssTop = visualScale > 0 ? (frameTop - cr.top) / visualScale : frameTop - cr.top;
      const cssHeight = visualScale > 0 ? frameHeight / visualScale : frameHeight;
      const sourceYPercent = bracketConnectorYPercentForCenter(frameTop, frameHeight, sourceCenter);
      const targetYPercent = bracketConnectorYPercentForCenter(frameTop, frameHeight, targetCenter);
      setGeom({
        ...bracketConnectorMeasuredLineFromSize(w, frameHeight, sourceYPercent, targetYPercent, false),
        frameStyle: {
          top: `${cssTop}px`,
          bottom: "auto",
          height: `${cssHeight}px`,
          minHeight: `${cssHeight}px`,
        },
      });
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const scope = el.parentElement ? connectorScope(el.parentElement) : null;
    for (const id of [sourceMatchId, targetMatchId]) {
      const match = matchById(scope, id);
      if (match) ro.observe(match);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [anchorY, sourceMatchId, targetMatchId]);

  return (
    <div
      ref={wrapRef}
      className={styles.connectorDynamicWrap}
      style={frameStyle}
      data-bracket-connector="stack-link"
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

/** SVG for one connector gutter between two rounds. */
export function BracketConnectorCell({
  variant,
  feedsFinalPodiumMatch = false,
  topMatchId,
  bottomMatchId,
  targetMatchId,
  anchorY = "match",
}: {
  variant: BracketConnectorVariant;
  /** Gutter feeds the final column when podium layout splits championship + 3rd-place bands. */
  feedsFinalPodiumMatch?: boolean;
  topMatchId?: string;
  bottomMatchId?: string;
  targetMatchId?: string;
  /** `match`: whole-card center (default). `slot`: midpoint between home/away team rows. */
  anchorY?: BracketConnectorAnchor;
}) {
  if (variant === "both") {
    return (
      <MeasuredFeedersConnector
        variant="both"
        feedsFinalPodiumMatch={feedsFinalPodiumMatch}
        topMatchId={topMatchId}
        bottomMatchId={bottomMatchId}
        targetMatchId={targetMatchId}
        anchorY={anchorY}
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
        anchorY={anchorY}
      />
    );
  }
  return <div className={styles.connectorDynamicWrap} aria-hidden />;
}
