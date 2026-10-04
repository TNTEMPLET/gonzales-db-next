"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";

import { seasonCutoffIso } from "@/lib/ageDivisions/draft";
import {
  applyAgeSpan,
  applyCutoffPreset,
  birthdateInsideBand,
  buildTimelineModel,
  dateAtRatio,
  daysBetween,
  detectCutoffPreset,
  divisionBirthdateSpans,
  dragBoundaryUpdate,
  formatPlayerShift,
  formatTimelineDate,
  nudgeEdge,
  nudgeUnitForKey,
  playerShiftDeltas,
  shiftIsoDate,
  splitCursorDate,
  unionBirthdateAxis,
  type DateField,
  type NudgeUnit,
  type TimelineEdge,
  type TimelineMember,
  type TimelineModel,
} from "@/lib/ageDivisions/forecastTimeline";
import { combineDivisions, formatTeamRange, splitDivisionAt, type ProposedConfig } from "@/lib/ageDivisions/forecastView";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";

function nextDragCommit(lastCommitMs: number, waitMs: number): number | null {
  const now = Date.now();
  if (now - lastCommitMs <= waitMs) return null;
  return now;
}

const fieldClass =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-white";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-60";

const BAND_COLORS = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#22d3ee",
  "#a3e635",
  "#c084fc",
  "#f97316",
  "#60a5fa",
  "#2dd4bf",
  "#e879f9",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type TimelineCount = {
  code: string;
  label: string;
  pool: number;
  expected: number;
  minTeams: number;
  maxTeams: number;
};

type SelectedEdge = { code: string; field: DateField };

type DragState = {
  pointerId: number;
  startX: number;
  moved: boolean;
  edge: TimelineEdge;
  axisOldest: string;
  axisYoungest: string;
  base: DivisionAgeConfig[];
  linkEdges: boolean;
  cutoffIso: string;
  preview: DivisionAgeConfig[];
};

function bandColor(sortOrder: number): string {
  const index = Math.abs(Math.trunc(sortOrder) - 1) % BAND_COLORS.length;
  return BAND_COLORS[index] ?? BAND_COLORS[0]!;
}

function bandForeground(hex: string): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.64 ? "#18181b" : "#ffffff";
}

function presetButtonClass(active: boolean): string {
  return active
    ? "inline-flex min-h-11 items-center justify-center rounded-xl border border-white bg-white px-3 text-sm font-semibold text-zinc-950"
    : buttonClass;
}

function samePools(origin: readonly { code: string; pool: number }[], counts: readonly TimelineCount[]): boolean {
  if (origin.length !== counts.length) return false;
  return origin.every((row) => counts.some((item) => item.code === row.code && item.pool === row.pool));
}

function TimelineTrack({
  model,
  interactive,
  counts,
  trackRef,
  selected,
  splitCursor,
  onEdgePointerDown,
  onEdgePointerMove,
  onEdgePointerUp,
  onEdgeKeyDown,
  onEdgeClick,
  onEdgeFocus,
  onEdgeTip,
  onBandClick,
  onBandKeyDown,
}: {
  model: TimelineModel;
  interactive: boolean;
  counts: readonly TimelineCount[] | null;
  trackRef?: RefObject<HTMLDivElement | null>;
  selected: SelectedEdge | null;
  splitCursor: { code: string; date: string } | null;
  onEdgePointerDown: (event: PointerEvent<HTMLButtonElement>, edge: TimelineEdge) => void;
  onEdgePointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onEdgePointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  onEdgeKeyDown: (event: KeyboardEvent<HTMLButtonElement>, edge: TimelineEdge) => void;
  onEdgeClick: (edge: TimelineEdge) => void;
  onEdgeFocus: (edge: TimelineEdge) => void;
  onEdgeTip?: (edge: TimelineEdge, anchor: HTMLElement | null) => void;
  onBandClick: (member: TimelineMember, event: MouseEvent<HTMLButtonElement>) => void;
  onBandKeyDown: (member: TimelineMember, event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const stack = model.bands.reduce((max, band) => Math.max(max, band.members.length), 1);
  const row = interactive ? Math.max(56, stack * 36) : Math.max(32, stack * 22);
  const height = model.laneCount * row;
  const span = Math.max(1, daysBetween(model.axisOldest, model.axisYoungest));
  return (
    <div ref={trackRef} className="relative rounded-xl bg-zinc-950" style={{ height }}>
      {model.ticks.map((tick) => (
        <div
          key={tick.label}
          className="pointer-events-none absolute inset-y-0 border-l border-zinc-800/80"
          style={{ left: `${tick.left}%` }}
        />
      ))}
      {model.gaps.map((gap) => (
        <div
          key={`gap-${gap.from}-${gap.to}`}
          className="absolute inset-y-2 rounded-md bg-red-500 shadow-[inset_0_0_0_2px_rgba(254,202,202,0.85)]"
          style={{ left: `${gap.left}%`, width: `${Math.max(gap.width, 0.4)}%` }}
          data-testid={interactive ? "timeline-gap" : undefined}
          title={`Gap ${formatTimelineDate(gap.from)} through ${formatTimelineDate(gap.to)}`}
        >
          {gap.width > 6 ? (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider text-white">
              Gap
            </span>
          ) : null}
        </div>
      ))}
      {model.bands.map((band) => (
        <div
          key={band.key}
          className="absolute flex flex-col overflow-hidden rounded-lg shadow-sm"
          style={{
            left: `${band.left}%`,
            width: `${Math.max(band.width, 0.6)}%`,
            top: band.lane * row + 4,
            height: row - 8,
          }}
        >
          {band.members.map((member) => {
            const color = bandColor(member.sortOrder);
            const count = counts?.find((rowCount) => rowCount.code === member.code);
            const cursor = splitCursor?.code === member.code ? splitCursor.date : null;
            const cursorLeft =
              cursor && band.youngest >= band.oldest
                ? (daysBetween(band.oldest, cursor) / Math.max(1, daysBetween(band.oldest, band.youngest))) * 100
                : null;
            return (
              interactive ? (
              <button
                key={member.code}
                type="button"
                className="relative flex min-w-0 flex-1 flex-col justify-center px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-white"
                style={{ backgroundColor: color, color: bandForeground(color) }}
                data-testid={`timeline-band-${member.code}`}
                aria-label={`${member.label}, ages ${member.minAge} to ${member.maxAge}, ${formatTimelineDate(member.oldest)} through ${formatTimelineDate(member.youngest)}. Press Enter to split at the marked birthdate.`}
                onClick={(event) => onBandClick(member, event)}
                onKeyDown={(event) => onBandKeyDown(member, event)}
              >
                <span className="block truncate text-xs font-semibold leading-tight">{member.label}</span>
                {count && interactive ? (
                  <span className="block truncate text-[10px] leading-tight opacity-90">
                    {count.pool} · {formatTeamRange(count.minTeams, count.maxTeams)}
                  </span>
                ) : null}
                {cursorLeft != null ? (
                  <span
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-zinc-950"
                    style={{ left: `${cursorLeft}%` }}
                  />
                ) : null}
              </button>
              ) : (
              <div
                key={member.code}
                className="relative flex min-w-0 flex-1 flex-col justify-center px-1 text-left"
                style={{ backgroundColor: color, color: bandForeground(color) }}
                data-testid={`timeline-band-${member.code}`}
              >
                <span className="block truncate text-[10px] font-semibold leading-tight">{member.label}</span>
              </div>
              )
            );
          })}
        </div>
      ))}
      {model.overlaps.map((overlap) => (
        <div
          key={`overlap-${overlap.from}-${overlap.to}-${overlap.codes.join("+")}`}
          className="pointer-events-none absolute inset-y-1"
          style={{
            left: `${overlap.left}%`,
            width: `${Math.max(overlap.width, 0.4)}%`,
            backgroundImage:
              "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(24,24,27,0.55) 4px, rgba(24,24,27,0.55) 8px)",
          }}
          data-testid={interactive ? "timeline-overlap" : undefined}
          title={`Overlap ${formatTimelineDate(overlap.from)} through ${formatTimelineDate(overlap.to)}`}
        />
      ))}
      {interactive
        ? model.edges.map((edge) => {
            const active = selected?.code === edge.code && selected.field === edge.field;
            return (
              <button
                key={edge.id}
                type="button"
                role="slider"
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={span}
                aria-valuenow={Math.max(0, daysBetween(model.axisOldest, edge.date))}
                aria-valuetext={edge.hint}
                aria-label={edge.ariaLabel}
                data-testid={`timeline-edge-${edge.id}`}
                className={`absolute inset-y-0 z-10 w-11 -translate-x-1/2 touch-none outline-none ${active ? "z-20" : ""}`}
                style={{ left: `${edge.left}%` }}
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
                onPointerEnter={(event) => onEdgeTip?.(edge, event.currentTarget)}
                onPointerLeave={() => onEdgeTip?.(edge, null)}
              >
                <span
                  className={`pointer-events-none absolute inset-y-1 left-1/2 w-1 -translate-x-1/2 rounded-full ${active ? "bg-white" : "bg-white/90"} shadow`}
                />
              </button>
            );
          })
        : null}
    </div>
  );
}

export function DivisionAgesForecastTimeline({
  proposed,
  baseline,
  targetSeason,
  linkEdges,
  counts,
  countsLoading,
  onDivisions,
  onCutoff,
  onReplace,
  onLinkEdges,
  onReset,
  readOnly = false,
}: {
  proposed: ProposedConfig;
  baseline: ProposedConfig | null;
  targetSeason: number;
  linkEdges: boolean;
  counts: readonly TimelineCount[] | null;
  countsLoading: boolean;
  onDivisions: (divisions: DivisionAgeConfig[]) => void;
  onCutoff: (patch: Partial<LeagueAgeRule>) => void;
  onReplace: (next: ProposedConfig) => void;
  onLinkEdges: (value: boolean) => void;
  onReset: () => void;
  /** Hide drag, presets, and age edits. The bars, gaps, and counts stay. */
  readOnly?: boolean;
}) {
  const cutoffIso = seasonCutoffIso(proposed.cutoff, targetSeason);
  const baselineIso = baseline ? seasonCutoffIso(baseline.cutoff, targetSeason) : cutoffIso;
  const [preview, setPreview] = useState<DivisionAgeConfig[] | null>(null);
  const [selected, setSelected] = useState<SelectedEdge | null>(null);
  const [splitCursor, setSplitCursor] = useState<{ code: string; date: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shiftText, setShiftText] = useState("");
  const [counting, setCounting] = useState(false);
  const [edgeTip, setEdgeTip] = useState<{ hint: string; detail: string; left: number; top: number } | null>(null);
  const tipAnchor = useRef<{ edge: TimelineEdge; element: HTMLElement } | null>(null);

  function placeEdgeTip(edge: TimelineEdge, anchor: HTMLElement | null) {
    if (!anchor) {
      if (tipAnchor.current?.edge.id !== edge.id) return;
      tipAnchor.current = null;
      setEdgeTip(null);
      return;
    }
    tipAnchor.current = { edge, element: anchor };
    const rect = anchor.getBoundingClientRect();
    setEdgeTip({ hint: edge.hint, detail: edge.detail, left: rect.left + rect.width / 2, top: rect.top });
  }

  function refreshEdgeTip() {
    const anchor = tipAnchor.current;
    if (!anchor) return;
    const rect = anchor.element.getBoundingClientRect();
    setEdgeTip({
      hint: anchor.edge.hint,
      detail: anchor.edge.detail,
      left: rect.left + rect.width / 2,
      top: rect.top,
    });
  }
  const [frozenAxis, setFrozenAxis] = useState<{ oldest: string; youngest: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const draggingRef = useRef(false);
  const suppressClick = useRef(false);
  const lastCommit = useRef(0);
  const originRef = useRef<{ code: string; label: string; pool: number }[] | null>(null);

  const displayDivisions = preview ?? proposed.divisions;
  const activeSelection =
    selected && displayDivisions.some((division) => division.code === selected.code) ? selected : null;
  const axis = useMemo(() => {
    const ranges = [
      ...divisionBirthdateSpans(proposed.divisions, cutoffIso),
      ...(baseline ? divisionBirthdateSpans(baseline.divisions, baselineIso) : []),
    ];
    return unionBirthdateAxis(ranges);
  }, [proposed.divisions, baseline, cutoffIso, baselineIso]);
  const layoutAxis = frozenAxis ?? axis;
  const proposedModel = useMemo(
    () => buildTimelineModel(displayDivisions, cutoffIso, layoutAxis),
    [displayDivisions, cutoffIso, layoutAxis],
  );
  const currentModel = useMemo(
    () => (baseline ? buildTimelineModel(baseline.divisions, baselineIso, layoutAxis) : null),
    [baseline, baselineIso, layoutAxis],
  );

  useEffect(() => {
    const origin = originRef.current;
    if (!origin || countsLoading || !counts || samePools(origin, counts)) return;
    setShiftText(formatPlayerShift(playerShiftDeltas(origin, counts)));
    setCounting(false);
    if (!draggingRef.current) originRef.current = null;
  }, [counts, countsLoading]);

  function rememberCounts() {
    if (!counts) return;
    originRef.current = counts.map((row) => ({ code: row.code, label: row.label, pool: row.pool }));
    setCounting(true);
  }

  function commit(next: DivisionAgeConfig[], freshOrigin: boolean) {
    if (freshOrigin) rememberCounts();
    onDivisions(next);
  }

  function onPreset(preset: "little-league" | "dyb") {
    setPreview(null);
    setActionError(null);
    rememberCounts();
    onReplace(applyCutoffPreset(proposed, preset));
  }

  function onAge(code: string, field: "minAge" | "maxAge", raw: string) {
    if (!/^\d{1,2}$/.test(raw)) return;
    const value = Number(raw);
    const index = displayDivisions.findIndex((division) => division.code === code);
    const division = displayDivisions[index];
    if (!division) return;
    const minAge = field === "minAge" ? value : division.minAge;
    const maxAge = field === "maxAge" ? value : division.maxAge;
    setPreview(null);
    setActionError(null);
    commit(applyAgeSpan(displayDivisions, index, minAge, maxAge, cutoffIso, linkEdges), true);
  }

  function nudge(amount: number, unit: NudgeUnit) {
    if (!activeSelection) return;
    const index = displayDivisions.findIndex((division) => division.code === activeSelection.code);
    if (index < 0) return;
    setPreview(null);
    setActionError(null);
    commit(nudgeEdge(displayDivisions, index, activeSelection.field, amount, unit, cutoffIso, linkEdges), true);
  }

  function combineEdge(edge: TimelineEdge) {
    const result = combineDivisions(proposed.divisions, [...edge.olderCodes, ...edge.youngerCodes], cutoffIso);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionError(null);
    setPreview(null);
    commit(result.divisions, true);
  }

  function splitAt(code: string, date: string) {
    const result = splitDivisionAt(proposed.divisions, code, date, cutoffIso);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setActionError(null);
    setSplitCursor(null);
    commit(result.divisions, true);
  }

  function onEdgePointerDown(event: PointerEvent<HTMLButtonElement>, edge: TimelineEdge) {
    if (event.button !== 0 || !layoutAxis) return;
    tipAnchor.current = null;
    setEdgeTip(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected({ code: edge.code, field: edge.field });
    rememberCounts();
    draggingRef.current = true;
    setFrozenAxis(layoutAxis);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      moved: false,
      edge,
      axisOldest: layoutAxis.oldest,
      axisYoungest: layoutAxis.youngest,
      base: proposed.divisions.map((division) => ({ ...division })),
      linkEdges,
      cutoffIso,
      preview: proposed.divisions,
    };
  }

  function onEdgePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 4) drag.moved = true;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const date = dateAtRatio(drag.axisOldest, drag.axisYoungest, ratio);
    const next = dragBoundaryUpdate(drag.base, drag.edge.divisionIndex, drag.edge.field, date, drag.cutoffIso, drag.linkEdges);
    drag.preview = next;
    setPreview(next);
    const committedAt = nextDragCommit(lastCommit.current, 320);
    if (drag.moved && committedAt != null) {
      lastCommit.current = committedAt;
      onDivisions(next);
    }
  }

  function onEdgePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    draggingRef.current = false;
    dragRef.current = null;
    setFrozenAxis(null);
    if (drag.moved) {
      suppressClick.current = true;
      setPreview(null);
      if (JSON.stringify(drag.preview) === JSON.stringify(drag.base)) {
        originRef.current = null;
        setCounting(false);
        return;
      }
      onDivisions(drag.preview);
      return;
    }
    if (!drag.edge.canCombine) {
      originRef.current = null;
      setCounting(false);
    }
    setPreview(null);
  }

  function onEdgeClick(edge: TimelineEdge) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (edge.canCombine) combineEdge(edge);
  }

  function onEdgeKeyDown(event: KeyboardEvent<HTMLButtonElement>, edge: TimelineEdge) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const index = proposed.divisions.findIndex((division) => division.code === edge.code);
    if (index < 0) return;
    setSelected({ code: edge.code, field: edge.field });
    setPreview(null);
    commit(
      nudgeEdge(proposed.divisions, index, edge.field, direction, nudgeUnitForKey(event), cutoffIso, linkEdges),
      true,
    );
  }

  function onBandClick(member: TimelineMember, event: MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || !layoutAxis) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const date = birthdateInsideBand(member.oldest, member.youngest, dateAtRatio(layoutAxis.oldest, layoutAxis.youngest, ratio));
    if (!date) {
      setActionError("Pick a date inside the division, before the youngest birthdate.");
      return;
    }
    splitAt(member.code, date);
  }

  function onBandKeyDown(member: TimelineMember, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = splitCursor?.code === member.code ? splitCursor.date : splitCursorDate(member.oldest, member.youngest);
    if (!current) {
      setActionError("That division is too narrow to split.");
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const next = shiftIsoDate(current, event.key === "ArrowRight" ? 1 : -1, "day");
      const inside = birthdateInsideBand(member.oldest, member.youngest, next);
      if (inside) setSplitCursor({ code: member.code, date: inside });
      return;
    }
    splitAt(member.code, current);
  }

  const preset = detectCutoffPreset(proposed.cutoff);
  const selectedEdge =
    proposedModel?.edges.find((edge) => edge.code === activeSelection?.code && edge.field === activeSelection.field) ??
    null;
  const legend = [...(proposedModel?.bands.flatMap((band) => band.members) ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );

  if (readOnly) {
    return (
      <div className="space-y-4" data-testid="birthdate-timeline">
        <div>
          <h3 className="text-sm font-semibold text-white">Birthdate windows</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Each bar is who belongs in that division. Red is a gap. Stripes are an overlap. This view is read-only.
          </p>
        </div>
        <div className="overflow-x-auto" data-testid="timeline-strips">
          <div className="min-w-[40rem] space-y-2">
            <div data-testid="timeline-proposed">
              {proposedModel ? (
                <TimelineTrack
                  model={proposedModel}
                  interactive={false}
                  counts={counts}
                  selected={null}
                  splitCursor={null}
                  onEdgePointerDown={() => {}}
                  onEdgePointerMove={() => {}}
                  onEdgePointerUp={() => {}}
                  onEdgeKeyDown={() => {}}
                  onEdgeClick={() => {}}
                  onEdgeFocus={() => {}}
                  onBandClick={() => {}}
                  onBandKeyDown={() => {}}
                />
              ) : (
                <p className="text-sm text-zinc-400">No birthdate windows to show.</p>
              )}
            </div>
            <div className="relative h-5">
              {proposedModel?.ticks.map((tick) => (
                <span
                  key={`label-${tick.label}`}
                  className="absolute top-0 -translate-x-1/2 text-[10px] tabular-nums text-zinc-500"
                  style={{ left: `${tick.left}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-300">
          {legend.map((member) => {
            const count = counts?.find((row) => row.code === member.code);
            return (
              <li key={member.code} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: bandColor(member.sortOrder) }} />
                <span>
                  {member.label}
                  {count ? ` · ${count.pool} players · ${formatTeamRange(count.minTeams, count.maxTeams)} teams` : ""}
                </span>
              </li>
            );
          })}
          {proposedModel && proposedModel.gaps.length > 0 ? (
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-red-400 bg-red-950" />
              Gap
            </li>
          ) : null}
          {proposedModel && proposedModel.overlaps.length > 0 ? (
            <li className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(-45deg, #fbbf24, #fbbf24 2px, #27272a 2px, #27272a 4px)",
                }}
              />
              Overlap
            </li>
          ) : null}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="birthdate-timeline">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cutoff preset</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Cutoff presets">
            <button
              type="button"
              className={presetButtonClass(preset === "little-league")}
              aria-pressed={preset === "little-league"}
              data-testid="cutoff-preset-little-league"
              onClick={() => onPreset("little-league")}
            >
              Little League (Aug 31)
            </button>
            <button
              type="button"
              className={presetButtonClass(preset === "dyb")}
              aria-pressed={preset === "dyb"}
              data-testid="cutoff-preset-dyb"
              onClick={() => onPreset("dyb")}
            >
              DYB (Apr 30)
            </button>
            <button
              type="button"
              className={presetButtonClass(preset === "custom")}
              aria-pressed={preset === "custom"}
              data-testid="cutoff-preset-custom"
              onClick={() => dayRef.current?.focus()}
            >
              Custom
            </button>
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            Presets keep each division&apos;s ages and move every birthdate to {formatTimelineDate(cutoffIso) || "the cutoff"}.
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          data-testid="reset-proposed"
          aria-label="Reset proposed cutoffs to the current table"
          onClick={onReset}
        >
          Reset
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm text-zinc-300">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cutoff month</span>
          <select
            className={fieldClass}
            aria-label="Proposed cutoff month"
            value={proposed.cutoff.cutoffMonth}
            onChange={(event) => onCutoff({ cutoffMonth: Number(event.target.value) })}
          >
            {MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>
                {index + 1} — {month}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-300">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cutoff day</span>
          <input
            ref={dayRef}
            className={fieldClass}
            aria-label="Proposed cutoff day"
            data-testid="proposed-cutoff-day"
            inputMode="numeric"
            value={proposed.cutoff.cutoffDay}
            onChange={(event) => onCutoff({ cutoffDay: Number(event.target.value) })}
          />
        </label>
        <label className="text-sm text-zinc-300">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Year offset</span>
          <select
            className={fieldClass}
            aria-label="Proposed year offset"
            value={proposed.cutoff.yearOffset}
            onChange={(event) => onCutoff({ yearOffset: Number(event.target.value) })}
          >
            <option value={-1}>-1</option>
            <option value={0}>0</option>
            <option value={1}>+1</option>
            <option value={2}>+2</option>
          </select>
        </label>
      </div>

      <label className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-100">
        <input
          type="checkbox"
          data-testid="link-edges"
          checked={linkEdges}
          onChange={(event) => onLinkEdges(event.target.checked)}
        />
        Move neighbor edge too
      </label>

      <div className="overflow-x-auto" data-testid="timeline-strips" onScroll={refreshEdgeTip}>
        <div className="min-w-[40rem] space-y-2">
          {currentModel ? (
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Current</p>
              <div data-testid="timeline-current" className="opacity-80">
                <TimelineTrack
                  model={currentModel}
                  interactive={false}
                  counts={null}
                  selected={null}
                  splitCursor={null}
                  onEdgePointerDown={() => {}}
                  onEdgePointerMove={() => {}}
                  onEdgePointerUp={() => {}}
                  onEdgeKeyDown={() => {}}
                  onEdgeClick={() => {}}
                  onEdgeFocus={() => {}}
                  onBandClick={() => {}}
                  onBandKeyDown={() => {}}
                />
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Proposed</p>
            <div data-testid="timeline-proposed">
              {proposedModel ? (
                <TimelineTrack
                  model={proposedModel}
                  interactive
                  counts={counts}
                  trackRef={trackRef}
                  selected={activeSelection}
                  splitCursor={splitCursor}
                  onEdgePointerDown={onEdgePointerDown}
                  onEdgePointerMove={onEdgePointerMove}
                  onEdgePointerUp={onEdgePointerUp}
                  onEdgeKeyDown={onEdgeKeyDown}
                  onEdgeClick={onEdgeClick}
                  onEdgeFocus={(edge) => setSelected({ code: edge.code, field: edge.field })}
                  onEdgeTip={placeEdgeTip}
                  onBandClick={onBandClick}
                  onBandKeyDown={onBandKeyDown}
                />
              ) : (
                <p className="text-sm text-zinc-400">No birthdate windows to show.</p>
              )}
            </div>
          </div>
          <div className="relative ml-[calc(4.5rem+0.5rem)] h-5">
            {proposedModel?.ticks.map((tick) => (
              <span
                key={`label-${tick.label}`}
                className="absolute top-0 -translate-x-1/2 text-[10px] tabular-nums text-zinc-500"
                style={{ left: `${tick.left}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      {edgeTip ? (
        <p
          role="tooltip"
          data-testid="timeline-edge-tip"
          className="pointer-events-none fixed z-50 w-max max-w-xs -translate-x-1/2 -translate-y-full rounded-lg bg-white px-2 py-1 text-left text-xs font-medium text-zinc-900 shadow"
          style={{ left: edgeTip.left, top: edgeTip.top - 8 }}
        >
          {edgeTip.hint}
          <span className="mt-0.5 block font-normal text-zinc-600">{edgeTip.detail}</span>
        </p>
      ) : null}

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-300">
        {legend.map((member) => {
          const count = counts?.find((row) => row.code === member.code);
          return (
            <li key={member.code} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: bandColor(member.sortOrder) }} />
              <span>
                {member.label}
                {count ? ` · ${count.pool} players · ${formatTeamRange(count.minTeams, count.maxTeams)} teams` : ""}
              </span>
            </li>
          );
        })}
        {proposedModel && proposedModel.gaps.length > 0 ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-red-400 bg-red-950" />
            Gap
          </li>
        ) : null}
        {proposedModel && proposedModel.overlaps.length > 0 ? (
          <li className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(-45deg, #fbbf24, #fbbf24 2px, #27272a 2px, #27272a 4px)",
              }}
            />
            Overlap
          </li>
        ) : null}
      </ul>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
        <p className="text-sm text-zinc-100" data-testid="selected-edge">
          {selectedEdge ? (
            <>
              <span className="font-semibold text-white">{selectedEdge.hint}</span>
              <span className="mt-0.5 block text-zinc-400">{selectedEdge.detail}</span>
            </>
          ) : (
            "Select a boundary on the proposed bar."
          )}
        </p>
        <p className="mt-2 text-sm font-medium text-sky-100" data-testid="player-shift" aria-live="polite">
          {counting ? "Counting players…" : shiftText || "Move an edge to see how many players change divisions."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["−1 month", -1, "month"],
              ["−1 week", -1, "week"],
              ["−1 day", -1, "day"],
              ["+1 day", 1, "day"],
              ["+1 week", 1, "week"],
              ["+1 month", 1, "month"],
            ] as const
          ).map(([label, amount, unit]) => (
            <button
              key={label}
              type="button"
              className={buttonClass}
              disabled={!activeSelection}
              data-testid={`nudge-${amount}-${unit}`}
              onClick={() => nudge(amount, unit)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          Drag a boundary, or tab to one and use the arrow keys. Shift moves a week and Alt moves a month. Click a
          boundary to combine the divisions on either side. Click inside a division to split it at that birthdate, or
          tab to the division, move the mark with the arrow keys, and press Enter.
        </p>
        {splitCursor ? (
          <p className="mt-1 text-sm text-zinc-300">
            Split mark: {formatTimelineDate(splitCursor.date)}
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white">Edit by age</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Ages on {formatTimelineDate(cutoffIso)}. The birthdate window follows these ages.
        </p>
        <div className="mt-2 flex flex-wrap gap-2" data-testid="age-editor">
          {legend.map((member) => (
            <div key={member.code} className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-1">
              <span className="max-w-[7rem] truncate text-xs font-semibold text-zinc-200" title={member.label}>
                {member.label}
              </span>
              <input
                className="h-9 w-12 rounded-lg border border-zinc-700 bg-zinc-900 text-center text-sm text-white"
                inputMode="numeric"
                aria-label={`Minimum age for ${member.label}`}
                value={displayDivisions.find((division) => division.code === member.code)?.minAge ?? member.minAge}
                onChange={(event) => onAge(member.code, "minAge", event.target.value)}
              />
              <span className="text-xs text-zinc-500">to</span>
              <input
                className="h-9 w-12 rounded-lg border border-zinc-700 bg-zinc-900 text-center text-sm text-white"
                inputMode="numeric"
                aria-label={`Maximum age for ${member.label}`}
                value={displayDivisions.find((division) => division.code === member.code)?.maxAge ?? member.maxAge}
                onChange={(event) => onAge(member.code, "maxAge", event.target.value)}
              />
            </div>
          ))}
        </div>
      </div>

      {actionError ? (
        <p className="text-sm text-amber-200" role="alert" data-testid="timeline-action-error">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
