"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";

import {
  daysBetween,
  formatTimelineDate,
  type TimelineEdge,
  type TimelineModel,
  type TimelineMember,
} from "@/lib/ageDivisions/forecastTimeline";
import { touchingBoundaryKey } from "@/lib/ageDivisions/forecastView";
import {
  packSpringRows,
  shortTimelineLabel,
  springDivisionSummary,
  springLabelFontSize,
  springLeagueLabel,
  springLeagueOf,
  visibleYearTicks,
  withLeadingYear,
  type SpringLeagueId,
} from "@/lib/ageDivisions/springTimeline";

const UNCHANGED = "#3f3f46";
const UNCHANGED_TEXT = "#fafafa";
const CHANGED = "#38bdf8";
const CHANGED_TEXT = "#082f49";
const ROW_H = 28;
const ROW_GAP = 4;
const LANE_PAD = 6;

type BandCount = { code: string; pool: number; minTeams: number; maxTeams: number };

type BandMember = TimelineMember & { left: number; width: number };

type LaneModel = {
  id: SpringLeagueId;
  label: "LLB" | "DYB";
  rowCount: number;
  height: number;
  members: BandMember[];
  rowByCode: Map<string, number>;
};

function BoundaryLockIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="3" y="6" width="8" height="6" rx="1" fill="currentColor" />
      {open ? (
        <path d="M5 6V4.5a2 2 0 0 1 4 0" fill="none" stroke="currentColor" strokeWidth="1.4" />
      ) : (
        <path d="M5 6V4.5a2 2 0 0 1 4 0V6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      )}
    </svg>
  );
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return coarse;
}

function laneHeight(rowCount: number): number {
  const rows = Math.max(1, rowCount);
  return LANE_PAD * 2 + rows * ROW_H + (rows - 1) * ROW_GAP;
}

function rowTop(row: number): number {
  return LANE_PAD + row * (ROW_H + ROW_GAP);
}

function buildLanes(model: TimelineModel, fallback: SpringLeagueId | null): LaneModel[] {
  const members: BandMember[] = model.bands.flatMap((band) =>
    band.members.map((member) => ({ ...member, left: band.left, width: band.width })),
  );
  const buckets: Record<SpringLeagueId, BandMember[]> = { llb: [], dyb: [] };
  for (const member of members) {
    buckets[springLeagueOf(member, fallback)].push(member);
  }
  const lanes: LaneModel[] = [];
  for (const id of ["llb", "dyb"] as const) {
    const group = buckets[id];
    if (group.length === 0) continue;
    const rowByCode = packSpringRows(group);
    const rowCount = Math.max(1, ...[...rowByCode.values()].map((row) => row + 1));
    lanes.push({
      id,
      label: springLeagueLabel(id),
      rowCount,
      height: laneHeight(rowCount),
      members: group,
      rowByCode,
    });
  }
  return lanes;
}

function edgeCodes(edge: TimelineEdge): string[] {
  return [...edge.olderCodes, ...edge.youngerCodes];
}

function edgeJoined(edge: TimelineEdge, linkEdges: boolean, unlinked: ReadonlySet<string>): boolean {
  return (
    edge.kind === "between" &&
    linkEdges &&
    edge.olderCodes.length > 0 &&
    edge.youngerCodes.length > 0 &&
    edge.olderCodes.every((older) =>
      edge.youngerCodes.every((younger) => !unlinked.has(touchingBoundaryKey(older, younger))),
    )
  );
}

function edgeInvolves(edge: TimelineEdge, code: string): boolean {
  return edge.code === code || edge.olderCodes.includes(code) || edge.youngerCodes.includes(code);
}

export function DivisionAgesSpringStrips({
  model,
  counts,
  changedCodes,
  leagueFallback,
  linkEdges,
  unlinkedBoundaries,
  selectedEdge,
  splitCursor,
  draggingEdgeId,
  selectedCode,
  trackRef,
  assumedTrackWidth = 360,
  onSelectDivision,
  onEdgePointerDown,
  onEdgePointerMove,
  onEdgePointerUp,
  onEdgeKeyDown,
  onEdgeClick,
  onEdgeFocus,
  onEdgeTip,
  onToggleBoundary,
  onBandClick,
  onBandKeyDown,
}: {
  model: TimelineModel;
  counts: readonly BandCount[] | null;
  changedCodes: ReadonlySet<string>;
  leagueFallback: SpringLeagueId | null;
  linkEdges: boolean;
  unlinkedBoundaries: ReadonlySet<string>;
  selectedEdge: { code: string; field: "oldestBirthdate" | "youngestBirthdate" } | null;
  splitCursor: { code: string; date: string } | null;
  draggingEdgeId: string | null;
  selectedCode: string | null;
  trackRef?: RefObject<HTMLDivElement | null>;
  /** Width used for year labels until the plot is measured. */
  assumedTrackWidth?: number;
  onSelectDivision: (code: string) => void;
  onEdgePointerDown: (event: PointerEvent<HTMLButtonElement>, edge: TimelineEdge) => void;
  onEdgePointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onEdgePointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onEdgeKeyDown: (event: KeyboardEvent<HTMLButtonElement>, edge: TimelineEdge) => void;
  onEdgeClick: (edge: TimelineEdge) => void;
  onEdgeFocus: (edge: TimelineEdge) => void;
  onEdgeTip?: (edge: TimelineEdge, anchor: HTMLElement | null) => void;
  onToggleBoundary: (edge: TimelineEdge) => void;
  onBandClick: (member: TimelineMember, event: MouseEvent<HTMLButtonElement>) => void;
  onBandKeyDown: (member: TimelineMember, event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const coarse = useCoarsePointer();
  const [plotWidth, setPlotWidth] = useState(assumedTrackWidth);
  const [bandTip, setBandTip] = useState<{ title: string; lines: string[]; left: number; top: number } | null>(null);
  const touchBand = useRef(false);
  const lanes = useMemo(() => buildLanes(model, leagueFallback), [model, leagueFallback]);
  const ticks = useMemo(
    () => visibleYearTicks(withLeadingYear(model.ticks, model.axisOldest), plotWidth),
    [model.ticks, model.axisOldest, plotWidth],
  );
  const span = Math.max(1, daysBetween(model.axisOldest, model.axisYoungest));

  useEffect(() => {
    const node = trackRef?.current;
    if (!node) return;
    const update = () => setPlotWidth(node.clientWidth || 360);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [trackRef, lanes.length]);

  function summaryFor(member: BandMember) {
    const league = springLeagueLabel(springLeagueOf(member, leagueFallback));
    const count = counts?.find((row) => row.code === member.code) ?? null;
    return springDivisionSummary({
      label: member.label,
      league,
      oldest: member.oldest,
      youngest: member.youngest,
      count,
      changed: changedCodes.has(member.code),
    });
  }

  function showBandTip(member: BandMember, anchor: HTMLElement) {
    const summary = summaryFor(member);
    const rect = anchor.getBoundingClientRect();
    setBandTip({
      title: summary.title,
      lines: [summary.dates, summary.counts, summary.changed].filter((line) => line.length > 0),
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
  }

  return (
    <div data-testid="timeline-layout-spring" className="space-y-2">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 gap-y-2">
        {lanes.map((lane, laneIndex) => {
          const laneEdges = model.edges.filter(
            (edge) => edgeCodes(edge).some((code) => lane.rowByCode.has(code)) || lane.rowByCode.has(edge.code),
          );
          return (
            <div key={lane.id} className="contents">
              <div className="flex items-center" style={{ height: lane.height }}>
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">{lane.label}</span>
              </div>
              <div
                ref={laneIndex === 0 ? trackRef : undefined}
                data-testid={laneIndex === 0 ? "timeline-proposed" : `timeline-lane-plot-${lane.id}`}
                className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/80"
                style={{ height: lane.height }}
                role="group"
                aria-label={`${lane.label} divisions`}
              >
                <div data-testid={`timeline-lane-${lane.id}`} className="pointer-events-none absolute inset-0" />
                {ticks.map((tick) => (
                  <div
                    key={`${lane.id}-${tick.label}`}
                    className="pointer-events-none absolute inset-y-0 border-l border-zinc-800/90"
                    style={{ left: `${tick.left}%` }}
                  />
                ))}
                {model.gaps
                  .filter((gap) => gap.codes.some((code) => lane.rowByCode.has(code)))
                  .map((gap) => (
                    <div
                      key={`${lane.id}-gap-${gap.from}-${gap.to}`}
                      className="absolute z-0 rounded bg-red-950 ring-1 ring-red-400/80"
                      style={{
                        left: `${gap.left}%`,
                        width: `${Math.max(gap.width, 0.4)}%`,
                        top: 4,
                        bottom: 4,
                      }}
                      data-testid="timeline-gap"
                      title={`Gap ${formatTimelineDate(gap.from)} through ${formatTimelineDate(gap.to)}`}
                    />
                  ))}
                {lane.members.map((member) => {
                  const row = lane.rowByCode.get(member.code) ?? 0;
                  const changed = changedCodes.has(member.code);
                  const short = shortTimelineLabel(member.label, member.code);
                  const count = counts?.find((rowCount) => rowCount.code === member.code);
                  const selected = selectedCode === member.code;
                  const cursor = splitCursor?.code === member.code ? splitCursor.date : null;
                  const cursorLeft =
                    cursor && member.youngest >= member.oldest
                      ? (daysBetween(member.oldest, cursor) / Math.max(1, daysBetween(member.oldest, member.youngest))) * 100
                      : null;
                  const summary = summaryFor(member);
                  return (
                    <button
                      key={member.code}
                      type="button"
                      data-testid={`timeline-band-${member.code}`}
                      data-changed={changed ? "true" : "false"}
                      className="absolute z-[1] overflow-hidden rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-white"
                      style={{
                        left: `calc(${member.left}% + 1px)`,
                        width: `max(4px, calc(${Math.max(member.width, 0.45)}% - 2px))`,
                        top: rowTop(row),
                        height: ROW_H,
                        backgroundColor: changed ? CHANGED : UNCHANGED,
                        color: changed ? CHANGED_TEXT : UNCHANGED_TEXT,
                        boxShadow: selected ? "inset 0 0 0 2px #ffffff" : undefined,
                        containerType: "inline-size",
                      }}
                      aria-label={`${member.label}, ${summary.title}, ages ${member.minAge} to ${member.maxAge}, ${formatTimelineDate(member.oldest)} through ${formatTimelineDate(member.youngest)}${count ? `, ${count.pool} players, ${count.minTeams} to ${count.maxTeams} teams` : ""}${changed ? ", changed from current" : ""}. Press Enter to split at the marked birthdate.`}
                      onPointerDown={(event) => {
                        touchBand.current = event.pointerType === "touch";
                        onSelectDivision(member.code);
                      }}
                      onClick={(event) => {
                        if (touchBand.current) {
                          touchBand.current = false;
                          return;
                        }
                        onBandClick(member, event);
                      }}
                      onKeyDown={(event) => onBandKeyDown(member, event)}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "touch") return;
                        showBandTip(member, event.currentTarget);
                      }}
                      onPointerLeave={() => setBandTip(null)}
                      onFocus={(event) => showBandTip(member, event.currentTarget)}
                      onBlur={() => setBandTip(null)}
                    >
                      <span className="pointer-events-none flex h-full items-center justify-center gap-1 px-1" aria-hidden="true">
                        <span
                          className="font-semibold"
                          style={{
                            fontSize: springLabelFontSize(short, 12, changed ? 12 : 0),
                            lineHeight: 1.1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {short}
                        </span>
                        {changed ? (
                          <span
                            className="font-bold uppercase tracking-wide"
                            style={{
                              fontSize: springLabelFontSize(`${short} changed`, 9, 8),
                              lineHeight: 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            changed
                          </span>
                        ) : null}
                      </span>
                      {changed ? (
                        <span
                          data-testid={`timeline-changed-${member.code}`}
                          className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: "#082f49" }}
                        />
                      ) : null}
                      {cursorLeft != null ? (
                        <span
                          className="pointer-events-none absolute inset-y-0 w-0.5 bg-zinc-950"
                          style={{ left: `${cursorLeft}%` }}
                        />
                      ) : null}
                    </button>
                  );
                })}
                {laneEdges.map((edge) => {
                  const rows = edgeCodes(edge)
                    .map((code) => lane.rowByCode.get(code))
                    .filter((row): row is number => row != null);
                  const ownRow = lane.rowByCode.get(edge.code);
                  const used = rows.length > 0 ? rows : ownRow == null ? [0] : [ownRow];
                  const top = rowTop(Math.min(...used));
                  const bottom = rowTop(Math.max(...used)) + ROW_H;
                  const active = selectedEdge?.code === edge.code && selectedEdge.field === edge.field;
                  const dragging = draggingEdgeId === edge.id;
                  const selectedTouch = coarse && selectedCode != null && edgeInvolves(edge, selectedCode);
                  const shown = dragging || selectedTouch;
                  const joined = edgeJoined(edge, linkEdges, unlinkedBoundaries);
                  const showLock = linkEdges && edge.olderCodes.length > 0 && edge.youngerCodes.length > 0;
                  const reveal = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100";
                  return (
                    <div
                      key={edge.id}
                      className={`group pointer-events-none absolute z-10 -translate-x-1/2 ${shown && coarse ? "w-11" : "w-5"}`}
                      style={{ left: `${edge.left}%`, top, height: Math.max(ROW_H, bottom - top) }}
                    >
                      <button
                        type="button"
                        role="slider"
                        aria-orientation="horizontal"
                        aria-valuemin={0}
                        aria-valuemax={span}
                        aria-valuenow={Math.max(0, daysBetween(model.axisOldest, edge.date))}
                        aria-valuetext={edge.hint}
                        aria-label={edge.ariaLabel}
                        data-testid={`timeline-edge-${edge.id}`}
                        className={`absolute inset-0 touch-none outline-none focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                          coarse && !shown ? "pointer-events-none" : "pointer-events-auto"
                        } ${active ? "z-20" : ""}`}
                        onPointerDown={(event) => onEdgePointerDown(event, edge)}
                        onPointerMove={onEdgePointerMove}
                        onPointerUp={onEdgePointerUp}
                        onPointerCancel={onEdgePointerUp}
                        onKeyDown={(event) => onEdgeKeyDown(event, edge)}
                        onClick={() => onEdgeClick(edge)}
                        onFocus={(event) => {
                          onEdgeFocus(edge);
                          onEdgeTip?.(edge, event.currentTarget);
                        }}
                        onBlur={() => onEdgeTip?.(edge, null)}
                        onPointerEnter={(event) => {
                          if (event.pointerType !== "touch") onEdgeTip?.(edge, event.currentTarget);
                        }}
                        onPointerLeave={() => onEdgeTip?.(edge, null)}
                      />
                      <span
                        className={`pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-white shadow ${
                          shown ? "opacity-100" : reveal
                        }`}
                      />
                      {showLock ? (
                        <button
                          type="button"
                          data-testid={`boundary-lock-${edge.id}`}
                          aria-pressed={joined}
                          aria-label={
                            joined
                              ? "Joined boundary. Click to allow a gap between these divisions."
                              : "Open boundary. Click to join these divisions again."
                          }
                          title={joined ? "Joined. Click to allow a gap." : "Open. Click to join again."}
                          className={`absolute top-0.5 left-1/2 z-30 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-200 bg-zinc-950 text-zinc-50 shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                            shown
                              ? "pointer-events-auto opacity-100"
                              : `pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto ${reveal}`
                          }`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleBoundary(edge);
                          }}
                        >
                          <BoundaryLockIcon open={!joined} />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="relative col-start-2 h-5">
          {ticks.map((tick, index) => (
            <span
              key={`label-${tick.label}`}
              className={`absolute top-0 text-[10px] tabular-nums text-zinc-500 ${
                index === 0 ? "" : index === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
              }`}
              style={{ left: `${tick.left}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: UNCHANGED }} />
          Unchanged
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: CHANGED }} />
          Changed
        </span>
        {model.gaps.length > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-red-950 ring-1 ring-red-400" />
            Gap
          </span>
        ) : null}
      </div>
      <p className="text-xs text-zinc-500">
        Point at a boundary to drag it. On a phone, tap a division to show its handles.
      </p>
      {bandTip ? (
        <p
          role="tooltip"
          data-testid="timeline-band-tip"
          className="pointer-events-none fixed z-50 w-max max-w-xs -translate-x-1/2 -translate-y-full rounded-lg bg-white px-2 py-1 text-left text-xs font-medium text-zinc-900 shadow"
          style={{ left: bandTip.left, top: bandTip.top - 8 }}
        >
          {bandTip.title}
          {bandTip.lines.map((line) => (
            <span key={line} className="mt-0.5 block font-normal text-zinc-600">
              {line}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
