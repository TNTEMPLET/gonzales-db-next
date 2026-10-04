/**
 * View logic for the division-ages forecast timeline.
 * Date windows, presets, nudges, and drag updates only.
 * Headcount math stays in `forecast.ts`.
 */

import { calculatedRange, coverageWarnings, effectiveRange, leagueAge } from "./compute";
import { stripBirthdatesMatchingCutoff } from "./draft";
import { applyLinkedEdge, combineDivisions, type ProposedConfig } from "./forecastView";
import type { DivisionAgeConfig } from "./types";

export const AXIS_PAD_DAYS = 180;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export type DateField = "oldestBirthdate" | "youngestBirthdate";

export type NudgeUnit = "day" | "week" | "month";

export type CutoffPresetId = "little-league" | "dyb" | "custom";

export type TimelineMember = {
  index: number;
  code: string;
  label: string;
  minAge: number;
  maxAge: number;
  sortOrder: number;
  oldest: string;
  youngest: string;
};

export type TimelineBand = {
  key: string;
  oldest: string;
  youngest: string;
  lane: number;
  left: number;
  width: number;
  members: TimelineMember[];
};

export type TimelineEdge = {
  id: string;
  code: string;
  label: string;
  divisionIndex: number;
  field: DateField;
  date: string;
  left: number;
  kind: "start" | "end" | "between";
  hint: string;
  detail: string;
  ariaLabel: string;
  canCombine: boolean;
  olderCodes: string[];
  youngerCodes: string[];
};

export type TimelineSpan = {
  left: number;
  width: number;
  from: string;
  to: string;
  codes: string[];
};

export type TimelineTick = {
  left: number;
  label: string;
};

export type TimelineModel = {
  axisOldest: string;
  axisYoungest: string;
  ticks: TimelineTick[];
  bands: TimelineBand[];
  edges: TimelineEdge[];
  gaps: TimelineSpan[];
  overlaps: TimelineSpan[];
  laneCount: number;
};

type Ymd = { year: number; month: number; day: number };

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseYmd(value: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function addDays(iso: string, days: number): string {
  const parsed = parseYmd(iso);
  if (!parsed || !Number.isFinite(days)) return "";
  const utc = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  utc.setUTCDate(utc.getUTCDate() + Math.trunc(days));
  return formatYmd(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function addMonths(iso: string, months: number): string {
  const parsed = parseYmd(iso);
  if (!parsed || !Number.isInteger(months)) return "";
  let month = parsed.month + months;
  let year = parsed.year;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  const day = Math.min(parsed.day, daysInMonth(year, month));
  return formatYmd(year, month, day);
}

function cloneDivisions(divisions: readonly DivisionAgeConfig[]): DivisionAgeConfig[] {
  return divisions.map((division) => ({ ...division }));
}

function sameWindow(left: { oldest: string; youngest: string }, right: { oldest: string; youngest: string }): boolean {
  return Boolean(left.oldest) && left.oldest === right.oldest && left.youngest === right.youngest;
}

export function daysBetween(start: string, end: string): number {
  const from = parseYmd(start);
  const to = parseYmd(end);
  if (!from || !to) return 0;
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/** Inclusive calendar shift. Positive amounts move toward younger players (later birthdates). */
export function shiftIsoDate(iso: string, amount: number, unit: NudgeUnit): string {
  if (!parseYmd(iso) || !Number.isInteger(amount)) return "";
  if (unit === "month") return addMonths(iso, amount);
  const days = unit === "week" ? amount * 7 : amount;
  return addDays(iso, days);
}

export function nudgeUnitForKey(modifiers: { altKey: boolean; shiftKey: boolean }): NudgeUnit {
  if (modifiers.altKey) return "month";
  if (modifiers.shiftKey) return "week";
  return "day";
}

export function formatTimelineDate(iso: string): string {
  const parsed = parseYmd(iso);
  if (!parsed) return iso;
  return `${MONTHS[parsed.month - 1]} ${parsed.day}, ${parsed.year}`;
}

/** Plain language for one edge. Oldest is the earliest birthdate in the division. */
export function edgePhrase(field: DateField, iso: string): string {
  const date = formatTimelineDate(iso);
  if (!parseYmd(iso)) return "";
  return field === "oldestBirthdate" ? `born on or after ${date}` : `born on or before ${date}`;
}

export function birthdatesFromAges(
  minAge: number,
  maxAge: number,
  cutoffIso: string,
): { oldest: string; youngest: string } {
  return calculatedRange({ minAge, maxAge }, cutoffIso);
}

/** Ages on the cutoff date for an inclusive birthdate window. */
export function agesFromBirthdates(
  oldest: string,
  youngest: string,
  cutoffIso: string,
): { minAge: number; maxAge: number } | null {
  const minAge = leagueAge(youngest, cutoffIso);
  const maxAge = leagueAge(oldest, cutoffIso);
  if (!Number.isFinite(minAge) || !Number.isFinite(maxAge)) return null;
  return { minAge, maxAge };
}

export function detectCutoffPreset(cutoff: { cutoffMonth: number; cutoffDay: number }): CutoffPresetId {
  if (cutoff.cutoffMonth === 8 && cutoff.cutoffDay === 31) return "little-league";
  if (cutoff.cutoffMonth === 4 && cutoff.cutoffDay === 30) return "dyb";
  return "custom";
}

/**
 * Point every division at the preset cutoff and drop date overrides so each
 * window is derived again from its ages. Year offset stays put.
 */
export function applyCutoffPreset(
  config: ProposedConfig,
  preset: Exclude<CutoffPresetId, "custom">,
): ProposedConfig {
  const cutoffMonth = preset === "little-league" ? 8 : 4;
  const cutoffDay = preset === "little-league" ? 31 : 30;
  return {
    cutoff: { ...config.cutoff, cutoffMonth, cutoffDay },
    divisions: config.divisions.map((division) => {
      const next: DivisionAgeConfig = { ...division };
      delete next.oldestBirthdate;
      delete next.youngestBirthdate;
      return next;
    }),
  };
}

type OrderedDivision = {
  index: number;
  range: { oldest: string; youngest: string };
};

function orderedDivisions(divisions: readonly DivisionAgeConfig[], cutoffIso: string): OrderedDivision[] {
  return divisions
    .map((division, index) => ({
      index,
      sortOrder: division.sortOrder,
      code: division.code,
      range: effectiveRange(division, cutoffIso),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

function siblingBounds(ordered: readonly OrderedDivision[], selfPos: number): { start: number; end: number } {
  const range = ordered[selfPos]?.range;
  let start = selfPos;
  let end = selfPos;
  if (!range?.oldest || !range.youngest) return { start, end };
  while (start > 0 && sameWindow(ordered[start - 1]!.range, range)) start -= 1;
  while (end + 1 < ordered.length && sameWindow(ordered[end + 1]!.range, range)) end += 1;
  return { start, end };
}

/** Keep a division and its linked neighbor at least one day wide. */
export function clampEdgeDate(
  divisions: readonly DivisionAgeConfig[],
  divisionIndex: number,
  field: DateField,
  date: string,
  cutoffIso: string,
  linkEdges: boolean,
): string {
  if (!parseYmd(date)) return "";
  const ordered = orderedDivisions(divisions, cutoffIso);
  const selfPos = ordered.findIndex((item) => item.index === divisionIndex);
  if (selfPos < 0) return "";
  const self = ordered[selfPos]!;
  const { start, end } = linkEdges ? siblingBounds(ordered, selfPos) : { start: selfPos, end: selfPos };
  let next = date;
  if (field === "oldestBirthdate") {
    if (self.range.youngest && next > self.range.youngest) next = self.range.youngest;
    if (linkEdges && end + 1 < ordered.length) {
      const neighborOldest = ordered[end + 1]!.range.oldest;
      const floor = neighborOldest ? addDays(neighborOldest, 1) : "";
      if (floor && next < floor) next = floor;
    }
  } else {
    if (self.range.oldest && next < self.range.oldest) next = self.range.oldest;
    if (linkEdges && start > 0) {
      const neighborYoungest = ordered[start - 1]!.range.youngest;
      const cap = neighborYoungest ? addDays(neighborYoungest, -1) : "";
      if (cap && next > cap) next = cap;
    }
  }
  return next;
}

/**
 * Move one edge to `date`. Linked edges also move shared-window siblings
 * and the neighboring division's touching side.
 */
export function dragBoundaryUpdate(
  divisions: readonly DivisionAgeConfig[],
  divisionIndex: number,
  field: DateField,
  date: string,
  cutoffIso: string,
  linkEdges: boolean,
): DivisionAgeConfig[] {
  const current = divisions[divisionIndex];
  if (!current) return cloneDivisions(divisions);
  const range = effectiveRange(current, cutoffIso);
  const currentDate = field === "oldestBirthdate" ? range.oldest : range.youngest;
  const clamped = clampEdgeDate(divisions, divisionIndex, field, date, cutoffIso, linkEdges);
  if (!clamped || clamped === currentDate) return cloneDivisions(divisions);
  return applyLinkedEdge(divisions, divisionIndex, field, clamped, cutoffIso, linkEdges);
}

export function nudgeEdge(
  divisions: readonly DivisionAgeConfig[],
  divisionIndex: number,
  field: DateField,
  amount: number,
  unit: NudgeUnit,
  cutoffIso: string,
  linkEdges: boolean,
): DivisionAgeConfig[] {
  const current = divisions[divisionIndex];
  if (!current) return cloneDivisions(divisions);
  const range = effectiveRange(current, cutoffIso);
  const from = field === "oldestBirthdate" ? range.oldest : range.youngest;
  const shifted = from ? shiftIsoDate(from, amount, unit) : "";
  if (!shifted) return cloneDivisions(divisions);
  return dragBoundaryUpdate(divisions, divisionIndex, field, shifted, cutoffIso, linkEdges);
}

/**
 * Set ages on the cutoff date and derive the birthdate window.
 * Linked edges move the neighbor and any shared-window sibling.
 */
export function applyAgeSpan(
  divisions: readonly DivisionAgeConfig[],
  divisionIndex: number,
  minAge: number,
  maxAge: number,
  cutoffIso: string,
  linkEdges: boolean,
): DivisionAgeConfig[] {
  const current = divisions[divisionIndex];
  if (
    !current ||
    !Number.isInteger(minAge) ||
    !Number.isInteger(maxAge) ||
    minAge < 0 ||
    maxAge > 30 ||
    minAge > maxAge
  ) {
    return cloneDivisions(divisions);
  }
  const desired = calculatedRange({ minAge, maxAge }, cutoffIso);
  if (!desired.oldest || !desired.youngest || desired.oldest > desired.youngest) return cloneDivisions(divisions);
  const originalRange = effectiveRange(current, cutoffIso);
  let next = dragBoundaryUpdate(divisions, divisionIndex, "oldestBirthdate", desired.oldest, cutoffIso, linkEdges);
  next = dragBoundaryUpdate(next, divisionIndex, "youngestBirthdate", desired.youngest, cutoffIso, linkEdges);
  return next.map((division, index) => {
    const source = divisions[index];
    if (!source) return division;
    const sourceRange = effectiveRange(source, cutoffIso);
    const shared =
      Boolean(originalRange.oldest) &&
      sourceRange.oldest === originalRange.oldest &&
      sourceRange.youngest === originalRange.youngest;
    if (index !== divisionIndex && !(linkEdges && shared)) return division;
    return stripBirthdatesMatchingCutoff({ ...division, minAge, maxAge }, cutoffIso);
  });
}

export type PoolSnapshot = {
  code: string;
  label: string;
  pool: number;
};

export function playerShiftDeltas(
  before: readonly PoolSnapshot[],
  after: readonly PoolSnapshot[],
): { label: string; delta: number }[] {
  const beforeMap = new Map(before.map((row) => [row.code, row]));
  const afterMap = new Map(after.map((row) => [row.code, row]));
  const deltas: { label: string; delta: number }[] = [];
  for (const code of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    const prev = beforeMap.get(code);
    const next = afterMap.get(code);
    const delta = (next?.pool ?? 0) - (prev?.pool ?? 0);
    if (delta === 0) continue;
    deltas.push({ label: next?.label ?? prev?.label ?? code, delta });
  }
  return deltas;
}

/** "+12 players into 8U, −12 from 7U" */
export function formatPlayerShift(changes: readonly { label: string; delta: number }[]): string {
  const gains = changes
    .filter((change) => change.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.label.localeCompare(b.label));
  const losses = changes
    .filter((change) => change.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.label.localeCompare(b.label));
  if (gains.length === 0 && losses.length === 0) return "No players change divisions.";
  const parts = [
    ...gains.map((change) => `+${change.delta} players into ${change.label}`),
    ...losses.map((change) => `−${Math.abs(change.delta)} from ${change.label}`),
  ];
  return parts.join(", ");
}

export function dateAtRatio(axisOldest: string, axisYoungest: string, ratio: number): string {
  const span = daysBetween(axisOldest, axisYoungest);
  if (!parseYmd(axisOldest) || span <= 0) return axisOldest;
  const clamped = Math.min(1, Math.max(0, ratio));
  return addDays(axisOldest, Math.round(clamped * span));
}

/** A split date must sit on the oldest day or later, and before the youngest day. */
export function birthdateInsideBand(oldest: string, youngest: string, date: string): string | null {
  if (!parseYmd(date) || !parseYmd(oldest) || !parseYmd(youngest)) return null;
  if (date < oldest || date >= youngest) return null;
  return date;
}

export function splitCursorDate(oldest: string, youngest: string): string | null {
  if (!parseYmd(oldest) || !parseYmd(youngest) || oldest >= youngest) return null;
  const span = daysBetween(oldest, youngest);
  const offset = Math.max(0, Math.min(span - 1, Math.floor(span / 2)));
  return addDays(oldest, offset);
}

export function divisionBirthdateSpans(
  divisions: readonly DivisionAgeConfig[],
  cutoffIso: string,
): { oldest: string; youngest: string }[] {
  return divisions.map((division) => {
    const range = effectiveRange(division, cutoffIso);
    return { oldest: range.oldest, youngest: range.youngest };
  });
}

export function unionBirthdateAxis(
  ranges: readonly { oldest: string; youngest: string }[],
  padDays = AXIS_PAD_DAYS,
): { oldest: string; youngest: string } | null {
  let oldest = "";
  let youngest = "";
  for (const range of ranges) {
    if (!parseYmd(range.oldest) || !parseYmd(range.youngest) || range.oldest > range.youngest) continue;
    if (!oldest || range.oldest < oldest) oldest = range.oldest;
    if (!youngest || range.youngest > youngest) youngest = range.youngest;
  }
  if (!oldest || !youngest) return null;
  const paddedOldest = addDays(oldest, -padDays);
  const paddedYoungest = addDays(youngest, padDays);
  if (!paddedOldest || !paddedYoungest) return null;
  return { oldest: paddedOldest, youngest: paddedYoungest };
}

function ratioOnAxis(axisOldest: string, axisYoungest: string, date: string): number {
  const span = daysBetween(axisOldest, axisYoungest);
  if (span <= 0) return 0;
  return daysBetween(axisOldest, date) / span;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function inclusiveBox(
  axisOldest: string,
  axisYoungest: string,
  from: string,
  to: string,
): { left: number; width: number } {
  const end = addDays(to, 1);
  const startRatio = clamp01(ratioOnAxis(axisOldest, axisYoungest, from));
  const endRatio = clamp01(ratioOnAxis(axisOldest, axisYoungest, end || to));
  return { left: startRatio * 100, width: Math.max(0, (endRatio - startRatio) * 100) };
}

function edgeMarkerLeft(axisOldest: string, axisYoungest: string, field: DateField, date: string): number {
  const marker = field === "youngestBirthdate" ? addDays(date, 1) : date;
  return clamp01(ratioOnAxis(axisOldest, axisYoungest, marker || date)) * 100;
}

function yearTicks(axisOldest: string, axisYoungest: string): TimelineTick[] {
  const startYear = Number(axisOldest.slice(0, 4));
  const endYear = Number(axisYoungest.slice(0, 4));
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) return [];
  const ticks: TimelineTick[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const date = `${year}-01-01`;
    if (date < axisOldest || date > axisYoungest) continue;
    ticks.push({ left: clamp01(ratioOnAxis(axisOldest, axisYoungest, date)) * 100, label: String(year) });
  }
  return ticks;
}

function memberWindows(divisions: readonly DivisionAgeConfig[], cutoffIso: string): TimelineMember[] {
  const members: TimelineMember[] = [];
  divisions.forEach((division, index) => {
    const range = effectiveRange(division, cutoffIso);
    if (!range.oldest || !range.youngest || range.oldest > range.youngest) return;
    members.push({
      index,
      code: division.code,
      label: division.label,
      minAge: division.minAge,
      maxAge: division.maxAge,
      sortOrder: division.sortOrder,
      oldest: range.oldest,
      youngest: range.youngest,
    });
  });
  return members;
}

function clusterMembers(members: readonly TimelineMember[]): TimelineMember[][] {
  const groups = new Map<string, TimelineMember[]>();
  for (const member of members) {
    const key = `${member.oldest}|${member.youngest}`;
    const list = groups.get(key);
    if (list) list.push(member);
    else groups.set(key, [member]);
  }
  return [...groups.values()]
    .map((group) => group.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)))
    .sort(
      (a, b) =>
        a[0]!.oldest.localeCompare(b[0]!.oldest) ||
        a[0]!.youngest.localeCompare(b[0]!.youngest) ||
        a[0]!.sortOrder - b[0]!.sortOrder,
    );
}

function assignLanes(clusters: readonly TimelineMember[][]): number[] {
  const laneEnds: string[] = [];
  const lanes: number[] = [];
  for (const cluster of clusters) {
    const oldest = cluster[0]!.oldest;
    const youngest = cluster[0]!.youngest;
    let lane = laneEnds.findIndex((end) => end < oldest);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(youngest);
    } else {
      laneEnds[lane] = youngest;
    }
    lanes.push(lane);
  }
  return lanes;
}

type DraftEdge = {
  id: string;
  code: string;
  label: string;
  divisionIndex: number;
  field: DateField;
  date: string;
  kind: "start" | "end" | "between";
  canCombine: boolean;
  olderCodes: string[];
  youngerCodes: string[];
  olderLabels: string[];
  youngerLabels: string[];
};

function buildEdges(
  clusters: readonly TimelineMember[][],
  divisions: readonly DivisionAgeConfig[],
  cutoffIso: string,
): DraftEdge[] {
  const edges: DraftEdge[] = [];
  clusters.forEach((cluster, clusterIndex) => {
    const primary = cluster[0]!;
    const previous = clusters[clusterIndex - 1];
    const next = clusters[clusterIndex + 1];
    const touchesPrevious = previous != null && addDays(previous[0]!.youngest, 1) === primary.oldest;
    const touchesNext = next != null && addDays(primary.youngest, 1) === next[0]!.oldest;
    if (!touchesPrevious) {
      edges.push({
        id: `start:${cluster.map((member) => member.code).join("+")}`,
        code: primary.code,
        label: primary.label,
        divisionIndex: primary.index,
        field: "oldestBirthdate",
        date: primary.oldest,
        kind: "start",
        canCombine: false,
        olderCodes: [],
        youngerCodes: cluster.map((member) => member.code),
        olderLabels: [],
        youngerLabels: cluster.map((member) => member.label),
      });
    }
    if (!touchesNext) {
      edges.push({
        id: `end:${cluster.map((member) => member.code).join("+")}`,
        code: primary.code,
        label: primary.label,
        divisionIndex: primary.index,
        field: "youngestBirthdate",
        date: primary.youngest,
        kind: "end",
        canCombine: false,
        olderCodes: cluster.map((member) => member.code),
        youngerCodes: [],
        olderLabels: cluster.map((member) => member.label),
        youngerLabels: [],
      });
    } else if (next) {
      const olderCodes = cluster.map((member) => member.code);
      const youngerCodes = next.map((member) => member.code);
      const younger = next[0]!;
      const combined = combineDivisions(divisions, [...olderCodes, ...youngerCodes], cutoffIso);
      edges.push({
        id: `between:${olderCodes.join("+")}:${youngerCodes.join("+")}`,
        code: younger.code,
        label: younger.label,
        divisionIndex: younger.index,
        field: "oldestBirthdate",
        date: younger.oldest,
        kind: "between",
        canCombine: combined.ok,
        olderCodes,
        youngerCodes,
        olderLabels: cluster.map((member) => member.label),
        youngerLabels: next.map((member) => member.label),
      });
    }
  });
  return edges;
}

function edgeCopy(edge: DraftEdge): { hint: string; detail: string; ariaLabel: string } {
  const hint = edgePhrase(edge.field, edge.date);
  if (edge.kind === "between") {
    const older = edge.olderLabels.join(" and ");
    const younger = edge.youngerLabels.join(" and ");
    const detail = `${younger} starts. ${older} ends the day before.`;
    const ariaLabel = `Boundary between ${older} and ${younger}, ${hint}. Drag or press the arrow keys to move this edge. Press Enter to combine these divisions.`;
    return { hint, detail, ariaLabel };
  }
  if (edge.field === "oldestBirthdate") {
    const name = edge.youngerLabels.join(" and ") || edge.label;
    return {
      hint,
      detail: `${name} starts.`,
      ariaLabel: `Oldest birthdate for ${name}, ${hint}. Drag or press the arrow keys to move this edge.`,
    };
  }
  const name = edge.olderLabels.join(" and ") || edge.label;
  return {
    hint,
    detail: `${name} ends.`,
    ariaLabel: `Youngest birthdate for ${name}, ${hint}. Drag or press the arrow keys to move this edge.`,
  };
}

function exactSharedOverlap(
  from: string,
  to: string,
  codes: readonly string[],
  byCode: ReadonlyMap<string, TimelineMember>,
): boolean {
  const ranges = codes.map((code) => byCode.get(code)).filter((member): member is TimelineMember => member != null);
  if (ranges.length < 2) return false;
  const oldest = ranges[0]!.oldest;
  const youngest = ranges[0]!.youngest;
  return ranges.every((member) => member.oldest === oldest && member.youngest === youngest) && from === oldest && to === youngest;
}

export function buildTimelineModel(
  divisions: readonly DivisionAgeConfig[],
  cutoffIso: string,
  axis: { oldest: string; youngest: string } | null,
): TimelineModel | null {
  if (!axis || !parseYmd(axis.oldest) || !parseYmd(axis.youngest) || axis.oldest > axis.youngest) return null;
  const members = memberWindows(divisions, cutoffIso);
  const clusters = clusterMembers(members);
  const lanes = assignLanes(clusters);
  const byCode = new Map(members.map((member) => [member.code, member]));
  const bands: TimelineBand[] = clusters.map((cluster, index) => {
    const oldest = cluster[0]!.oldest;
    const youngest = cluster[0]!.youngest;
    const box = inclusiveBox(axis.oldest, axis.youngest, oldest, youngest);
    return {
      key: cluster.map((member) => member.code).join("+"),
      oldest,
      youngest,
      lane: lanes[index] ?? 0,
      left: box.left,
      width: box.width,
      members: cluster,
    };
  });
  const edges: TimelineEdge[] = buildEdges(clusters, divisions, cutoffIso).map((edge) => {
    const copy = edgeCopy(edge);
    return {
      id: edge.id,
      code: edge.code,
      label: edge.label,
      divisionIndex: edge.divisionIndex,
      field: edge.field,
      date: edge.date,
      left: edgeMarkerLeft(axis.oldest, axis.youngest, edge.field, edge.date),
      kind: edge.kind,
      hint: copy.hint,
      detail: copy.detail,
      ariaLabel: copy.ariaLabel,
      canCombine: edge.canCombine,
      olderCodes: edge.olderCodes,
      youngerCodes: edge.youngerCodes,
    };
  });
  const warnings = coverageWarnings([...divisions], cutoffIso);
  const gaps: TimelineSpan[] = [];
  const overlaps: TimelineSpan[] = [];
  for (const warning of warnings) {
    if (!warning.from || !warning.to || warning.from > warning.to) continue;
    const box = inclusiveBox(axis.oldest, axis.youngest, warning.from, warning.to);
    const span = { ...box, from: warning.from, to: warning.to, codes: [...warning.divisionCodes] };
    if (warning.kind === "gap") gaps.push(span);
    if (warning.kind === "overlap" && !exactSharedOverlap(warning.from, warning.to, warning.divisionCodes, byCode)) {
      overlaps.push(span);
    }
  }
  return {
    axisOldest: axis.oldest,
    axisYoungest: axis.youngest,
    ticks: yearTicks(axis.oldest, axis.youngest),
    bands,
    edges,
    gaps,
    overlaps,
    laneCount: Math.max(1, lanes.reduce((max, lane) => Math.max(max, lane + 1), 0)),
  };
}
