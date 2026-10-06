"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";

import { uncoveredSpans } from "@/lib/ageDivisions/compute";
import { seasonCutoffIso } from "@/lib/ageDivisions/draft";
import {
  applyAgeSpan,
  applyCombinedCutoffPreset,
  applyCutoffPreset,
  combinedPresetApplied,
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
  type TimelineSpan,
} from "@/lib/ageDivisions/forecastTimeline";
import { DivisionAgesSpringStrips } from "@/components/admin/DivisionAgesSpringTimeline";
import {
  changedDivisionCodes,
  SPRING_AXIS_PAD_DAYS,
  springDivisionSummary,
  springLeagueLabel,
  springLeagueOf,
  type ForecastTimelineLayout,
  type SpringLeagueId,
} from "@/lib/ageDivisions/springTimeline";
import {
  combineDivisions,
  formatTeamRange,
  splitDivisionAt,
  touchingBoundaryKey,
  type ProposedConfig,
} from "@/lib/ageDivisions/forecastView";
import type { BirthdateRange, DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";

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
  unlinked: ReadonlySet<string>;
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

function BoundaryLockIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="3" y="6" width="8" height="6" rx="1" fill="currentColor" />
      {open ? (
        <path d="M5 6V4.5a2 2 0 0 1 4 0" fill="none" stroke="currentColor" strokeWidth="1.4" />
      ) : (
        <path d="M5 6V4.5a2 2 0 0 1 4 0V6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      )}
    </svg>
  );
}

const NO_UNLINKED = new Set<string>();

/** Per-browser Spring preference. Fall may read the value but ignores it (no toggle / write). */
export const SPRING_AGE_EDITOR_STORAGE_KEY = "gdb-division-ages-spring-age-editor-open";

export function springAgeEditorSummary(count: number): string {
  const total = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return `${total} ${total === 1 ? "division" : "divisions"}`;
}

export function readSpringAgeEditorOpen(
  storage: { getItem(key: string): string | null } | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SPRING_AGE_EDITOR_STORAGE_KEY) === "open";
  } catch {
    return false;
  }
}

export function writeSpringAgeEditorOpen(
  storage: { setItem(key: string, value: string): void } | null | undefined,
  open: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(SPRING_AGE_EDITOR_STORAGE_KEY, open ? "open" : "closed");
  } catch {
    /* ignore quota / private mode */
  }
}

function browserAgeEditorStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const springAgeEditorListeners = new Set<() => void>();

function subscribeSpringAgeEditor(onStoreChange: () => void) {
  springAgeEditorListeners.add(onStoreChange);
  return () => {
    springAgeEditorListeners.delete(onStoreChange);
  };
}

function emitSpringAgeEditor() {
  for (const listener of springAgeEditorListeners) listener();
}

function springAgeEditorSnapshot(): boolean {
  return readSpringAgeEditorOpen(browserAgeEditorStorage());
}

function springAgeEditorServerSnapshot(): boolean {
  return false;
}

function AgeEditorChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M7 10l5 5 5-5z" />
    </svg>
  );
}

function AgeEditorGrid({
  legend,
  divisions,
  onAge,
}: {
  legend: readonly TimelineMember[];
  divisions: readonly DivisionAgeConfig[];
  onAge: (code: string, field: "minAge" | "maxAge", raw: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2" data-testid="age-editor">
      {legend.map((member) => {
        const division = divisions.find((item) => item.code === member.code);
        return (
          <div key={member.code} className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-1">
            <span className="max-w-[7rem] truncate text-xs font-semibold text-zinc-200" title={member.label}>
              {member.label}
            </span>
            <input
              className="h-9 w-12 rounded-lg border border-zinc-700 bg-zinc-900 text-center text-sm text-white"
              inputMode="numeric"
              aria-label={`Minimum age for ${member.label}`}
              value={division?.minAge ?? member.minAge}
              onChange={(event) => onAge(member.code, "minAge", event.target.value)}
            />
            <span className="text-xs text-zinc-500">to</span>
            <input
              className="h-9 w-12 rounded-lg border border-zinc-700 bg-zinc-900 text-center text-sm text-white"
              inputMode="numeric"
              aria-label={`Maximum age for ${member.label}`}
              value={division?.maxAge ?? member.maxAge}
              onChange={(event) => onAge(member.code, "maxAge", event.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
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
  linkEdges = false,
  unlinkedBoundaries = NO_UNLINKED,
  onToggleBoundary = () => {},
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
  linkEdges?: boolean;
  unlinkedBoundaries?: ReadonlySet<string>;
  onToggleBoundary?: (edge: TimelineEdge) => void;
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
            const joined =
              edge.kind === "between" &&
              linkEdges &&
              edge.olderCodes.every((older) =>
                edge.youngerCodes.every((younger) => !unlinkedBoundaries.has(touchingBoundaryKey(older, younger))),
              );
            return (
              <span key={edge.id}>
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
                {linkEdges && edge.olderCodes.length > 0 && edge.youngerCodes.length > 0 ? (
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
                    className="absolute top-0 z-30 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-200 bg-zinc-950 text-zinc-50 shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    style={{ left: `${edge.left}%` }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleBoundary(edge);
                    }}
                  >
                    <BoundaryLockIcon open={!joined} />
                  </button>
                ) : null}
              </span>
            );
          })
        : null}
    </div>
  );
}

function gapsNotCoveredElsewhere(model: TimelineModel, coverRanges: readonly BirthdateRange[]): TimelineSpan[] {
  const span = Math.max(1, daysBetween(model.axisOldest, model.axisYoungest));
  const next: TimelineSpan[] = [];
  for (const gap of model.gaps) {
    for (const hole of uncoveredSpans(gap.from, gap.to, coverRanges)) {
      const start = daysBetween(model.axisOldest, hole.from);
      const end = daysBetween(model.axisOldest, hole.to) + 1;
      next.push({
        from: hole.from,
        to: hole.to,
        codes: gap.codes,
        left: (start / span) * 100,
        width: Math.max(0, ((end - start) / span) * 100),
      });
    }
  }
  return next;
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
  impact = null,
  unlinkedBoundaries = NO_UNLINKED,
  onToggleBoundary = () => {},
  combinedPresets = false,
  layout = "classic",
  leagueFallback = null,
  coverRanges,
  assumedTrackWidth = 360,
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
  /** Boundaries a click has opened. Holding Alt while dragging also leaves one line open. */
  unlinkedBoundaries?: ReadonlySet<string>;
  onToggleBoundary?: (edge: TimelineEdge) => void;
  /**
   * Presets move one league's normal rows and leave the other league in place.
   * The shared month, day, and year fields stay off this view.
   */
  combinedPresets?: boolean;
  /**
   * `spring-lanes` is the Spring forecast chart. Fall and the division
   * builder omit this and keep the classic strip below.
   */
  layout?: ForecastTimelineLayout;
  /** Single-league Spring. Combined Spring reads the code prefix instead. */
  leagueFallback?: SpringLeagueId | null;
  /**
   * Other-league windows. On the read-only builder strip, a gap those windows
   * already cover is not drawn in red. Forecast charts omit this.
   */
  coverRanges?: readonly BirthdateRange[];
  /** Year-label density until the plot width is measured. */
  assumedTrackWidth?: number;
  /** Hide drag, presets, and age edits. The bars, gaps, and counts stay. */
  readOnly?: boolean;
  /** Session impact, shown under the cutoff fields while this editor is interactive. */
  impact?: ReactNode;
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
  const [draggingEdgeId, setDraggingEdgeId] = useState<string | null>(null);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const ageEditorOpen = useSyncExternalStore(
    subscribeSpringAgeEditor,
    springAgeEditorSnapshot,
    springAgeEditorServerSnapshot,
  );
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
    return unionBirthdateAxis(ranges, layout === "spring-lanes" ? SPRING_AXIS_PAD_DAYS : undefined);
  }, [proposed.divisions, baseline, cutoffIso, baselineIso, layout]);
  const layoutAxis = frozenAxis ?? axis;
  const proposedModel = useMemo(
    () => buildTimelineModel(displayDivisions, cutoffIso, layoutAxis),
    [displayDivisions, cutoffIso, layoutAxis],
  );
  const proposedTrack = useMemo(() => {
    if (!proposedModel || !readOnly || !coverRanges || coverRanges.length === 0) return proposedModel;
    return { ...proposedModel, gaps: gapsNotCoveredElsewhere(proposedModel, coverRanges) };
  }, [proposedModel, readOnly, coverRanges]);
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
    onReplace(
      combinedPresets ? applyCombinedCutoffPreset(proposed, preset, targetSeason) : applyCutoffPreset(proposed, preset),
    );
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
    commit(
      applyAgeSpan(displayDivisions, index, minAge, maxAge, cutoffIso, linkEdges, { unlinked: unlinkedBoundaries }),
      true,
    );
  }

  function toggleAgeEditor() {
    writeSpringAgeEditorOpen(browserAgeEditorStorage(), !ageEditorOpen);
    emitSpringAgeEditor();
  }

  function nudge(amount: number, unit: NudgeUnit) {
    if (!activeSelection) return;
    const index = displayDivisions.findIndex((division) => division.code === activeSelection.code);
    if (index < 0) return;
    setPreview(null);
    setActionError(null);
    commit(
      nudgeEdge(displayDivisions, index, activeSelection.field, amount, unit, cutoffIso, linkEdges, {
        unlinked: unlinkedBoundaries,
      }),
      true,
    );
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
    setDraggingEdgeId(edge.id);
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
      unlinked: unlinkedBoundaries,
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
    const next = dragBoundaryUpdate(
      drag.base,
      drag.edge.divisionIndex,
      drag.edge.field,
      date,
      drag.cutoffIso,
      drag.linkEdges,
      { unlinkTouching: event.altKey, unlinked: drag.unlinked },
    );
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
    setDraggingEdgeId(null);
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
      nudgeEdge(proposed.divisions, index, edge.field, direction, nudgeUnitForKey(event), cutoffIso, linkEdges, {
        unlinked: unlinkedBoundaries,
      }),
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
  const leaguePreset = combinedPresets
    ? {
        littleLeague: combinedPresetApplied(proposed, "little-league", targetSeason),
        dyb: combinedPresetApplied(proposed, "dyb", targetSeason),
      }
    : null;
  const selectedEdge =
    proposedModel?.edges.find((edge) => edge.code === activeSelection?.code && edge.field === activeSelection.field) ??
    null;
  const legend = [...(proposedModel?.bands.flatMap((band) => band.members) ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  const springLanes = layout === "spring-lanes" && !readOnly;
  const changedSet = new Set(
    springLanes ? changedDivisionCodes(displayDivisions, baseline, cutoffIso, baselineIso) : [],
  );
  const selectedMember =
    proposedModel?.bands.flatMap((band) => band.members).find((member) => member.code === selectedDivision) ?? null;
  const selectedSummary =
    springLanes && selectedMember
      ? springDivisionSummary({
          label: selectedMember.label,
          league: springLeagueLabel(springLeagueOf(selectedMember, leagueFallback)),
          oldest: selectedMember.oldest,
          youngest: selectedMember.youngest,
          count: counts?.find((row) => row.code === selectedMember.code) ?? null,
          changed: changedSet.has(selectedMember.code),
        })
      : null;

  if (readOnly) {
    return (
      <div className="space-y-4" data-testid="birthdate-timeline">
        <div>
          <h3 className="text-sm font-semibold text-white">Birthdate windows</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Each bar is who belongs in that division.{" "}
            {coverRanges && coverRanges.length > 0
              ? "Red is a gap the other league does not cover."
              : "Red is a gap."}{" "}
            Stripes are an overlap. This view is read-only.
          </p>
        </div>
        <div className="overflow-x-auto" data-testid="timeline-strips">
          <div className="min-w-[40rem] space-y-2" data-testid="timeline-layout-classic">
            <div data-testid="timeline-proposed">
              {proposedTrack ? (
                <TimelineTrack
                  model={proposedTrack}
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
          {proposedTrack && proposedTrack.gaps.length > 0 ? (
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-red-400 bg-red-950" />
              Gap
            </li>
          ) : null}
          {proposedTrack && proposedTrack.overlaps.length > 0 ? (
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
              className={presetButtonClass(leaguePreset ? leaguePreset.littleLeague : preset === "little-league")}
              aria-pressed={leaguePreset ? leaguePreset.littleLeague : preset === "little-league"}
              data-testid="cutoff-preset-little-league"
              onClick={() => onPreset("little-league")}
            >
              {combinedPresets ? "Apply LL Aug 31 to LLB divisions" : "Little League (Aug 31)"}
            </button>
            <button
              type="button"
              className={presetButtonClass(leaguePreset ? leaguePreset.dyb : preset === "dyb")}
              aria-pressed={leaguePreset ? leaguePreset.dyb : preset === "dyb"}
              data-testid="cutoff-preset-dyb"
              onClick={() => onPreset("dyb")}
            >
              {combinedPresets ? "Apply DYB Apr 30 to DYB divisions" : "DYB (Apr 30)"}
            </button>
            {combinedPresets ? null : (
              <button
                type="button"
                className={presetButtonClass(preset === "custom")}
                aria-pressed={preset === "custom"}
                data-testid="cutoff-preset-custom"
                onClick={() => dayRef.current?.focus()}
              >
                Custom
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            {combinedPresets
              ? "Each button moves that league only. The other league stays put, and a division with its own dates, such as 7U or 8U Minors, stays put. Joined lines stay joined."
              : `Presets keep each division's ages and move every birthdate to ${formatTimelineDate(cutoffIso) || "the cutoff"}.`}
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

      {combinedPresets ? null : (
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
      )}

      {impact}

      <div className="space-y-2">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-100">
          <input
            type="checkbox"
            data-testid="link-edges"
            checked={linkEdges}
            onChange={(event) => onLinkEdges(event.target.checked)}
          />
          Keep joined boundaries together
        </label>
        <p className="text-sm text-zinc-400">
          Divisions that meet, where one ends the day before the next starts, stay on one line. Moving that line does
          not open a gap. Divisions with the same window move together. Overlapping windows, such as 7/8 Majors across
          7U and 8U, stay separate. Click the lock on a line, or hold Alt (Option) while dragging, to let that one
          boundary open a gap. An overlap is a note. It does not block the forecast.
        </p>
        {proposedModel && proposedModel.overlaps.length > 0 ? (
          <p
            className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
            role="status"
            data-testid="timeline-overlap-note"
          >
            These windows overlap. Players born in the shared dates fit more than one division.
          </p>
        ) : null}
      </div>

      <div className={springLanes ? "" : "overflow-x-auto"} data-testid="timeline-strips" onScroll={refreshEdgeTip}>
        {springLanes ? (
          proposedModel ? (
            <DivisionAgesSpringStrips
              model={proposedModel}
              counts={counts}
              changedCodes={changedSet}
              leagueFallback={leagueFallback}
              linkEdges={linkEdges}
              unlinkedBoundaries={unlinkedBoundaries}
              selectedEdge={activeSelection}
              splitCursor={splitCursor}
              draggingEdgeId={draggingEdgeId}
              selectedCode={selectedDivision}
              trackRef={trackRef}
              onSelectDivision={setSelectedDivision}
              onEdgePointerDown={onEdgePointerDown}
              onEdgePointerMove={onEdgePointerMove}
              onEdgePointerUp={onEdgePointerUp}
              onEdgeKeyDown={onEdgeKeyDown}
              onEdgeClick={onEdgeClick}
              onEdgeFocus={(edge) => setSelected({ code: edge.code, field: edge.field })}
              onEdgeTip={placeEdgeTip}
              onToggleBoundary={onToggleBoundary}
              onBandClick={onBandClick}
              onBandKeyDown={onBandKeyDown}
              assumedTrackWidth={assumedTrackWidth}
            />
          ) : (
            <p className="text-sm text-zinc-400">No birthdate windows to show.</p>
          )
        ) : (
        <div className="min-w-[40rem] space-y-2" data-testid="timeline-layout-classic">
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
                  linkEdges={linkEdges}
                  unlinkedBoundaries={unlinkedBoundaries}
                  onToggleBoundary={onToggleBoundary}
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
        )}
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

      {springLanes ? null : (
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
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
        {selectedSummary ? (
          <p className="mb-2 text-sm text-zinc-100" data-testid="selected-division">
            <span className="font-semibold text-white">{selectedSummary.title}</span>
            <span className="mt-0.5 block text-zinc-400">{selectedSummary.dates}</span>
            {selectedSummary.counts ? <span className="mt-0.5 block text-zinc-300">{selectedSummary.counts}</span> : null}
            {selectedSummary.changed ? <span className="mt-0.5 block text-sky-300">{selectedSummary.changed}</span> : null}
          </p>
        ) : null}
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
          Drag a boundary, or tab to one and use the arrow keys. Shift moves a week and Alt moves a month. Hold Alt
          (Option) while dragging to leave a joined line where it is. Click a boundary to combine the divisions on
          either side. Click inside a division to split it at that birthdate, or tab to the division, move the mark
          with the arrow keys, and press Enter.
        </p>
        {splitCursor ? (
          <p className="mt-1 text-sm text-zinc-300">
            Split mark: {formatTimelineDate(splitCursor.date)}
          </p>
        ) : null}
      </div>

      {springLanes ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40" data-testid="age-editor-section">
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-zinc-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-400"
            aria-expanded={ageEditorOpen}
            aria-controls="division-ages-age-editor"
            data-testid="age-editor-toggle"
            onClick={toggleAgeEditor}
          >
            <span className="text-sm font-semibold text-white">Edit by age</span>
            {ageEditorOpen ? (
              <span className="min-w-0 flex-1" />
            ) : (
              <span
                className="min-w-0 flex-1 truncate text-sm font-normal text-zinc-400"
                data-testid="age-editor-summary"
              >
                {springAgeEditorSummary(legend.length)}
              </span>
            )}
            <AgeEditorChevron open={ageEditorOpen} />
          </button>
          <div
            id="division-ages-age-editor"
            hidden={!ageEditorOpen}
            className={ageEditorOpen ? "border-t border-zinc-800 px-3 pb-3 pt-3" : undefined}
          >
            <p className="text-sm text-zinc-400">
              Ages on {formatTimelineDate(cutoffIso)}. The birthdate window follows these ages.
            </p>
            <AgeEditorGrid legend={legend} divisions={displayDivisions} onAge={onAge} />
          </div>
        </div>
      ) : (
      <div>
        <h3 className="text-sm font-semibold text-white">Edit by age</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Ages on {formatTimelineDate(cutoffIso)}. The birthdate window follows these ages.
        </p>
        <AgeEditorGrid legend={legend} divisions={displayDivisions} onAge={onAge} />
      </div>
      )}

      {actionError ? (
        <p className="text-sm text-amber-200" role="alert" data-testid="timeline-action-error">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
