"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import {
  BRACKET_PODIUM_CHAMPION_SOURCE_ATTR,
  BRACKET_PODIUM_CHAMPION_TARGET_ATTR,
  BRACKET_PODIUM_THIRD_SOURCE_ATTR,
  BRACKET_PODIUM_THIRD_TARGET_ATTR,
  bracketConnectorBothFromSize,
  bracketConnectorCenterFeederFromSize,
  bracketConnectorHorizontalAtPercentFromSize,
  bracketConnectorSingleFromSize,
  bracketConnectorYPercentBetweenCenters,
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

function useFinalPodiumHubYPercent(
  wrapRef: React.RefObject<HTMLDivElement | null>,
  feedsFinalPodiumMatch: boolean,
): number {
  const [hubY, setHubY] = useState(50);
  const getCell = useConnectorCellRect(wrapRef);

  useLayoutEffect(() => {
    if (!feedsFinalPodiumMatch) {
      setHubY(50);
      return;
    }
    const measure = () => {
      const cell = getCell();
      if (!cell) return;
      const root = wrapRef.current?.closest("section");
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
    const root = el?.closest("section");
    const match = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
    if (match) ro.observe(match);
    return () => ro.disconnect();
  }, [feedsFinalPodiumMatch, getCell, wrapRef]);

  return hubY;
}

/** Two visible feeders: viewBox aspect matches gutter cell (uniform scale, no shear). */
function BothFeedersConnector({ feedsFinalPodiumMatch = false }: { feedsFinalPodiumMatch?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hubY = useFinalPodiumHubYPercent(wrapRef, feedsFinalPodiumMatch);
  const [{ viewBox, d }, setGeom] = useState(() => bracketConnectorBothFromSize(40, 100, hubY));

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const pr = el.parentElement?.getBoundingClientRect();
      const cr = el.getBoundingClientRect();
      const w = Math.max(cr.width, pr?.width ?? 0);
      const h = Math.max(cr.height, pr?.height ?? 0);
      if (w < 2 || h < 2) return;
      setGeom(bracketConnectorBothFromSize(w, h, hubY));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [hubY]);

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

/** One visible feeder: same aspect-ratio treatment as {@link BothFeedersConnector}. */
function SingleFeederConnector({
  variant,
  feedsFinalPodiumMatch = false,
}: {
  variant: "top" | "bottom";
  feedsFinalPodiumMatch?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hubY = useFinalPodiumHubYPercent(wrapRef, feedsFinalPodiumMatch);
  const [{ viewBox, d }, setGeom] = useState(() => bracketConnectorSingleFromSize(40, 100, variant, hubY));

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const pr = el.parentElement?.getBoundingClientRect();
      const cr = el.getBoundingClientRect();
      const w = Math.max(cr.width, pr?.width ?? 0);
      const h = Math.max(cr.height, pr?.height ?? 0);
      if (w < 2 || h < 2) return;
      setGeom(bracketConnectorSingleFromSize(w, h, variant, hubY));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [variant, hubY]);

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

/** 3rd-place game → 3rd-place plaque: horizontal line at the midpoint of their vertical centers. */
function PodiumThirdConnector() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [{ viewBox, d }, setGeom] = useState(() => bracketConnectorHorizontalAtPercentFromSize(40, 100, 85));

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
      const root = cell.closest("section");
      const source = root?.querySelector(`[${BRACKET_PODIUM_THIRD_SOURCE_ATTR}]`);
      const target = root?.querySelector(`[${BRACKET_PODIUM_THIRD_TARGET_ATTR}]`);
      let yPercent = 85;
      if (source && target) {
        const sr = source.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        yPercent = bracketConnectorYPercentBetweenCenters(
          cr.top,
          cr.height,
          (sr.top + sr.bottom) / 2,
          (tr.top + tr.bottom) / 2,
        );
      }
      setGeom(bracketConnectorHorizontalAtPercentFromSize(w, h, yPercent));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const cell = el.parentElement?.parentElement;
    if (cell) ro.observe(cell);
    const root = cell?.closest("section");
    const source = root?.querySelector(`[${BRACKET_PODIUM_THIRD_SOURCE_ATTR}]`);
    const target = root?.querySelector(`[${BRACKET_PODIUM_THIRD_TARGET_ATTR}]`);
    if (source) ro.observe(source);
    if (target) ro.observe(target);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className={styles.connectorDynamicWrap} data-bracket-connector="podium-third" aria-hidden>
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
  const [{ viewBox, d }, setGeom] = useState(() => bracketConnectorHorizontalAtPercentFromSize(40, 100, 50));

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
      const root = cell.closest("section");
      const source = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
      const target = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_TARGET_ATTR}]`);
      let yPercent = 50;
      if (source && target) {
        const sr = source.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        yPercent = bracketConnectorYPercentBetweenCenters(
          cr.top,
          cr.height,
          (sr.top + sr.bottom) / 2,
          (tr.top + tr.bottom) / 2,
        );
      } else {
        setGeom(bracketConnectorCenterFeederFromSize(w, h));
        return;
      }
      setGeom(bracketConnectorHorizontalAtPercentFromSize(w, h, yPercent));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    const cell = el.parentElement?.parentElement;
    if (cell) ro.observe(cell);
    const root = cell?.closest("section");
    const source = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_SOURCE_ATTR}]`);
    const target = root?.querySelector(`[${BRACKET_PODIUM_CHAMPION_TARGET_ATTR}]`);
    if (source) ro.observe(source);
    if (target) ro.observe(target);
    return () => ro.disconnect();
  }, []);

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
    const root = el.closest("section");
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
}: {
  variant: BracketConnectorVariant;
  /** Gutter feeds the final column when podium layout splits championship + 3rd-place bands. */
  feedsFinalPodiumMatch?: boolean;
}) {
  if (variant === "both") {
    return <BothFeedersConnector feedsFinalPodiumMatch={feedsFinalPodiumMatch} />;
  }
  if (variant === "center") {
    return <RoundCenterConnector feedsFinalPodiumMatch={feedsFinalPodiumMatch} />;
  }
  if (variant === "top" || variant === "bottom") {
    return <SingleFeederConnector variant={variant} feedsFinalPodiumMatch={feedsFinalPodiumMatch} />;
  }
  return <div className={styles.connectorDynamicWrap} aria-hidden />;
}
