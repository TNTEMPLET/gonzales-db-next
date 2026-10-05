/**
 * Spring forecast timeline presentation.
 * Fall and the division builder stay on the classic strip in
 * `DivisionAgesForecastTimeline`. This module only decides layout, labels,
 * and which year ticks fit the width.
 */

import { effectiveRange } from "./compute";
import { combinedDivisionLeague, formatTimelineDate, type TimelineTick } from "./forecastTimeline";
import { formatTeamRange } from "./forecastView";
import type { DivisionAgeConfig } from "./types";

/** Days of air on each end of a Spring axis. The classic strip uses 180. */
export const SPRING_AXIS_PAD_DAYS = 14;

/**
 * Scrollable plot width on a narrow screen. Short names fit here.
 * Desktop is wider than this, so it does not scroll.
 */
export const SPRING_LANE_MIN_WIDTH = 680;

export type ForecastTimelineLayout = "classic" | "spring-lanes";

export type SpringLeagueId = "dyb" | "llb";

/**
 * Fall stays on the classic strip. Combined Spring and a single Spring
 * league (Gonzales DYB or Ascension LL) use one lane per league.
 */
export function forecastTimelineLayout(input: {
  org: string;
  springCombined?: boolean;
}): ForecastTimelineLayout {
  if (input.springCombined) return "spring-lanes";
  if (input.org === "gonzales" || input.org === "ascension") return "spring-lanes";
  return "classic";
}

/** Single-league Spring has no `gonzales:` / `ascension:` prefix on codes. */
export function springLeagueFallback(input: {
  org: string;
  springCombined?: boolean;
}): SpringLeagueId | null {
  if (input.springCombined) return null;
  if (input.org === "ascension") return "llb";
  if (input.org === "gonzales") return "dyb";
  return null;
}

export function springLeagueOf(
  division: { code: string; label: string },
  fallback: SpringLeagueId | null,
): SpringLeagueId {
  return combinedDivisionLeague(division) ?? fallback ?? "dyb";
}

export function springLeagueLabel(league: SpringLeagueId): "LLB" | "DYB" {
  return league === "llb" ? "LLB" : "DYB";
}

/**
 * Short bar text. Counts, exact dates, and the league name stay off the bar.
 * "12U", "T-Ball", and "7/8 Maj" are the shapes we aim for.
 */
export function shortTimelineLabel(label: string, code: string): string {
  const fromLabel = label.replace(/\b(LLB|DYB)\b/gi, " ").replace(/\s+/g, " ").trim();
  const text = fromLabel || code;
  const major = /\bmaj/i.test(text);
  const minor = /\bmin/i.test(text);
  const tee = /tee[\s-]*ball|\bt-ball\b/i.test(text);
  const modified = /\bmod/i.test(text);
  const range = text.match(/(\d+)\s*[-/]\s*(\d+)/);
  const single = text.match(/(\d+)\s*U\b/i) ?? code.match(/(\d+)\s*U\b/i);

  if (tee && modified) return "Mod";
  if (tee && !major) {
    if (single?.[1] === "5" && !range) return "5U TB";
    return "T-Ball";
  }
  if (major && range) return `${range[1]}/${range[2]} Maj`;
  if (major && single) return `${single[1]}U Maj`;
  if (minor && single && !range) return `${single[1]}U`;
  if (range) return `${range[1]}/${range[2]}U`;
  if (single) return `${single[1]}U`;
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 12 ? `${compact.slice(0, 11)}…` : compact;
}

/**
 * Last readable text before the label disappears.
 * "12U" becomes "12", "T-Ball" becomes "TB", and "7/8 Maj" becomes "7/8".
 */
export function compactTimelineLabel(label: string, code: string): string {
  const short = shortTimelineLabel(label, code);
  if (/^t-ball$/i.test(short)) return "TB";
  const range = short.match(/^(\d+)\s*\/\s*(\d+)/);
  if (range) return `${range[1]}/${range[2]}`;
  const age = short.match(/^(\d+)/);
  if (age) return age[1]!;
  return short.length <= 3 ? short : short.slice(0, 2);
}

function labelMinPx(text: string, extraPx = 0): number {
  return Math.ceil(text.length * 6.7 + 12 + extraPx);
}

/**
 * Hide the label when the bar is narrower than the text.
 * `100cqi` is the bar's inline size. A negative middle value clamps to 0,
 * so the words disappear instead of spilling out.
 */
export function springLabelFontSize(text: string, maxPx = 12, extraPx = 0): string {
  const minPx = labelMinPx(text, extraPx);
  return `clamp(0px, calc((100cqi - ${minPx}px) * 999), ${maxPx}px)`;
}

/**
 * Show the compact label only while the bar fits it and is still too
 * narrow for the longer label. Wider bars keep the longer text.
 */
export function springCompactLabelFontSize(compact: string, short: string, maxPx = 12, extraPx = 0): string {
  const compactMin = labelMinPx(compact, extraPx);
  const shortMin = labelMinPx(short, extraPx);
  const fitsCompact = `clamp(0px, calc((100cqi - ${compactMin}px) * 999), ${maxPx}px)`;
  const beforeShort = `clamp(0px, calc((${shortMin}px - 100cqi) * 999), ${maxPx}px)`;
  return `min(${fitsCompact}, ${beforeShort})`;
}

/**
 * Horizontal scroll that puts a bar in the visible plot.
 * Returns the current scroll when the bar is already fully in view.
 * `bandLeft` is the bar's x inside the scroll content.
 */
export function springLaneScrollLeft(input: {
  scrollLeft: number;
  clientWidth: number;
  stickyWidth: number;
  bandLeft: number;
  bandWidth: number;
}): number {
  const sticky = Math.max(0, input.stickyWidth);
  const viewLeft = input.scrollLeft + sticky;
  const viewRight = input.scrollLeft + Math.max(0, input.clientWidth);
  const bandRight = input.bandLeft + Math.max(0, input.bandWidth);
  if (input.bandLeft >= viewLeft - 1 && bandRight <= viewRight + 1) return input.scrollLeft;
  const viewWidth = Math.max(1, input.clientWidth - sticky);
  const centered = input.bandLeft - sticky - Math.max(0, (viewWidth - input.bandWidth) / 2);
  return Math.max(0, Math.round(centered));
}

export type SpringRowDivision = {
  code: string;
  oldest: string;
  youngest: string;
  sortOrder: number;
};

/**
 * Pack divisions into as few sub-rows as possible.
 * Touching windows share a row. Overlapping windows, including a majors
 * bar across two minors, take the next row.
 */
export function packSpringRows(members: readonly SpringRowDivision[]): Map<string, number> {
  const sorted = [...members].sort(
    (a, b) =>
      a.oldest.localeCompare(b.oldest) ||
      a.youngest.localeCompare(b.youngest) ||
      a.sortOrder - b.sortOrder ||
      a.code.localeCompare(b.code),
  );
  const rowEnds: string[] = [];
  const rows = new Map<string, number>();
  for (const member of sorted) {
    let row = rowEnds.findIndex((end) => end < member.oldest);
    if (row < 0) {
      row = rowEnds.length;
      rowEnds.push(member.youngest);
    } else {
      rowEnds[row] = member.youngest;
    }
    rows.set(member.code, row);
  }
  return rows;
}

/** Divisions whose birthdate window differs from the current table. */
export function changedDivisionCodes(
  proposed: readonly DivisionAgeConfig[],
  baseline: { divisions: readonly DivisionAgeConfig[] } | null,
  proposedCutoffIso: string,
  baselineCutoffIso: string,
): string[] {
  if (!baseline || !proposedCutoffIso || !baselineCutoffIso) return [];
  const previous = new Map(baseline.divisions.map((division) => [division.code, division]));
  const changed: string[] = [];
  for (const division of proposed) {
    const before = previous.get(division.code);
    if (!before) {
      changed.push(division.code);
      continue;
    }
    const nextRange = effectiveRange(division, proposedCutoffIso);
    const prevRange = effectiveRange(before, baselineCutoffIso);
    if (nextRange.oldest !== prevRange.oldest || nextRange.youngest !== prevRange.youngest) {
      changed.push(division.code);
    }
  }
  return changed;
}

/** Add the first birth year when January 1 sits just before the padded axis. */
export function withLeadingYear(ticks: readonly TimelineTick[], axisOldest: string): TimelineTick[] {
  const year = axisOldest.slice(0, 4);
  if (!/^\d{4}$/.test(year)) return [...ticks];
  if (ticks.some((tick) => tick.label === year)) return [...ticks];
  return [{ left: 0, label: year }, ...ticks];
}

/**
 * Keep the first and last year. Drop middle labels that would sit closer
 * than the gap for this width. Narrow screens keep fewer labels.
 */
export function visibleYearTicks(ticks: readonly TimelineTick[], widthPx: number): TimelineTick[] {
  if (ticks.length <= 2) return [...ticks];
  const width = widthPx > 0 ? widthPx : 360;
  const minGap = width < 420 ? 68 : width < 800 ? 52 : 40;
  const first = ticks[0]!;
  const last = ticks[ticks.length - 1]!;
  const kept: TimelineTick[] = [first];
  for (const tick of ticks.slice(1, -1)) {
    const px = (tick.left / 100) * width;
    const prevPx = (kept[kept.length - 1]!.left / 100) * width;
    const lastPx = (last.left / 100) * width;
    if (px - prevPx < minGap) continue;
    if (lastPx - px < minGap) continue;
    kept.push(tick);
  }
  kept.push(last);
  return kept;
}

export function springDivisionSummary(input: {
  label: string;
  league: "LLB" | "DYB" | null;
  oldest: string;
  youngest: string;
  count: { pool: number; minTeams: number; maxTeams: number } | null;
  changed: boolean;
}): { title: string; dates: string; counts: string; changed: string } {
  const dates = `${formatTimelineDate(input.oldest)} – ${formatTimelineDate(input.youngest)}`;
  return {
    title: input.league ? `${input.label} · ${input.league}` : input.label,
    dates,
    counts: input.count
      ? `${input.count.pool} players · ${formatTeamRange(input.count.minTeams, input.count.maxTeams)} teams`
      : "",
    changed: input.changed ? "Changed from current" : "",
  };
}
