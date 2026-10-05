/**
 * Client-safe forecast tab helpers. Counts and division labels only.
 * Nothing here accepts or returns a player name, birthdate list, or contact.
 */

import type { ContentOrgId } from "@/lib/siteConfig";

import { effectiveRange, leagueAge } from "./compute";
import { seasonCutoffIso, setDivisionBirthdate } from "./draft";
import {
  DEFAULT_RETURN_RATE,
  FALLBACK_RETENTION,
  type EligibilityContrast,
  type EligibilitySide,
  type ForecastFlow,
  type ForecastPopulation,
  type ForecastRow,
  type ForecastSide,
  type LeagueTotals,
  type PoolSplit,
  type SharedPool,
} from "./forecast";
import type { DivisionAgesSource } from "./schema";
import type { CoverageWarning, DivisionAgeConfig, LeagueAgeRule } from "./types";

export const FORECAST_DEBOUNCE_MS = 300;

export const FORECAST_CAVEATS = [
  "Estimate. The return rate comes from league settings and defaults to 100%.",
  "Spring→Fall carryover is reference only and is not used in the forecast.",
  "Feeder = a share of Ascension 2026 registrants not already in Gonzales. The share defaults to 10%.",
  "Overlapping divisions share one pool. League and team totals count each player once.",
  "Counts only.",
] as const;

export type ProposedConfig = {
  cutoff: LeagueAgeRule;
  divisions: DivisionAgeConfig[];
};

export type ForecastResponse = {
  organizationId: string;
  seasonYear: number;
  targetSeasonYear: number;
  includeFeeder: boolean;
  feederShare: number;
  notes: string[];
  source: "enrollment" | "roster";
  coveragePct: number | null;
  sources: {
    own: PoolSourceView;
    feeder: PoolSourceView;
  };
  carryover: {
    springDistinct: number;
    carried: number;
    rate: number | null;
    note: string | null;
  };
  retention: {
    applied: number;
    source: "override" | "league" | "default";
  };
  currentSource: DivisionAgesSource;
  proposedSource: "request" | "current";
  rows: ForecastRow[];
  sharedPools: SharedPool[];
  league: LeagueTotals;
  movers: number;
  flows: ForecastFlow[];
  currentWarnings: CoverageWarning[];
  proposedWarnings: CoverageWarning[];
  eligibility: EligibilityContrast[];
  current: ForecastPopulation;
  proposed: ForecastPopulation;
};

type PoolSourceView = {
  source: string;
  players: number;
  datedPlayers: number;
  coveragePct: number | null;
};

export function defaultIncludeFeeder(org: ContentOrgId): boolean {
  return org === "gonzales";
}

export function formatRetentionPercent(rate: number): string {
  const rounded = Math.round(rate * 1000) / 10;
  if (!Number.isFinite(rounded)) return "";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function defaultRetentionText(org: ContentOrgId): string {
  void org;
  return formatRetentionPercent(DEFAULT_RETURN_RATE);
}

export function shownRetentionPercent(input: {
  dirty: boolean;
  text: string;
  applied: number | null;
  org: ContentOrgId;
}): string {
  if (input.dirty) return input.text;
  if (input.applied != null && Number.isFinite(input.applied)) return formatRetentionPercent(input.applied);
  return defaultRetentionText(input.org);
}

export function parseRetentionPercent(
  text: string,
): { ok: true; rate: number } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) {
    return { ok: false, error: "Enter a percent from 0 to 100." };
  }
  const percent = Number(trimmed);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { ok: false, error: "Enter a percent from 0 to 100." };
  }
  return { ok: true, rate: percent / 100 };
}

export function formatTeamRange(minTeams: number, maxTeams: number): string {
  return `${minTeams}\u2013${maxTeams}`;
}

export function formatDelta(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0)) return "0";
  if (value > 0) return `+${value}`;
  return String(value);
}

export function formatDeltaTeams(minDelta: number, maxDelta: number): string {
  if (minDelta === maxDelta) return formatDelta(minDelta);
  return `${formatDelta(minDelta)}\u2013${formatDelta(maxDelta)}`;
}

export function forecastSeasonChoices(seasonYears: readonly number[], source: number, target: number): number[] {
  const years = new Set<number>(seasonYears);
  years.add(2026);
  years.add(2027);
  years.add(source);
  years.add(target);
  if (Number.isInteger(source)) years.add(source + 1);
  return [...years].filter((year) => Number.isInteger(year) && year >= 1990 && year <= 2200).sort((a, b) => a - b);
}

export function cloneProposed(config: ProposedConfig): ProposedConfig {
  return {
    cutoff: { ...config.cutoff },
    divisions: config.divisions.map((division) => ({
      code: division.code,
      label: division.label,
      minAge: division.minAge,
      maxAge: division.maxAge,
      sortOrder: division.sortOrder,
      ...(division.oldestBirthdate ? { oldestBirthdate: division.oldestBirthdate } : {}),
      ...(division.youngestBirthdate ? { youngestBirthdate: division.youngestBirthdate } : {}),
    })),
  };
}

export function withProposedCutoff(config: ProposedConfig, patch: Partial<LeagueAgeRule>): ProposedConfig {
  const cutoff = { ...config.cutoff, ...patch };
  const cutoffChanged =
    cutoff.cutoffMonth !== config.cutoff.cutoffMonth ||
    cutoff.cutoffDay !== config.cutoff.cutoffDay ||
    cutoff.yearOffset !== config.cutoff.yearOffset;
  return {
    cutoff,
    divisions: config.divisions.map((division) => {
      if (!cutoffChanged) return { ...division };
      const next: DivisionAgeConfig = { ...division };
      delete next.oldestBirthdate;
      delete next.youngestBirthdate;
      return next;
    }),
  };
}

export function forecastDraftKey(org: string, targetSeason: number): string {
  return `${org}|${targetSeason}`;
}

export function sameProposedConfig(a: ProposedConfig, b: ProposedConfig): boolean {
  return JSON.stringify(cloneProposed(a)) === JSON.stringify(cloneProposed(b));
}

/**
 * Save, delete, or leave a stored forecast draft alone.
 * A missing baseline means the season config is still loading, so an edit
 * must not be discarded.
 */
export function storedDraftAction(
  proposed: ProposedConfig | null,
  baseline: ProposedConfig | null,
): "save" | "delete" | "retain" {
  if (!baseline) return proposed ? "save" : "retain";
  if (!proposed || sameProposedConfig(proposed, baseline)) return "delete";
  return "save";
}

export function editedDivisionCodes(proposed: ProposedConfig, baseline: ProposedConfig): string[] {
  const baselineByCode = new Map(baseline.divisions.map((division) => [division.code, division]));
  const codes: string[] = [];
  for (const division of proposed.divisions) {
    const previous = baselineByCode.get(division.code);
    const changed =
      !previous ||
      division.minAge !== previous.minAge ||
      division.maxAge !== previous.maxAge ||
      division.sortOrder !== previous.sortOrder ||
      (division.oldestBirthdate ?? "") !== (previous.oldestBirthdate ?? "") ||
      (division.youngestBirthdate ?? "") !== (previous.youngestBirthdate ?? "");
    if (changed) codes.push(division.code);
  }
  return codes;
}

export function forecastEditedSummary(proposed: ProposedConfig, baseline: ProposedConfig): string {
  const cutoffEdited =
    proposed.cutoff.cutoffMonth !== baseline.cutoff.cutoffMonth ||
    proposed.cutoff.cutoffDay !== baseline.cutoff.cutoffDay ||
    proposed.cutoff.yearOffset !== baseline.cutoff.yearOffset;
  const count = editedDivisionCodes(proposed, baseline).length;
  const parts: string[] = [];
  if (cutoffEdited) parts.push("Cutoff edited");
  if (count === 1) parts.push("1 division edited");
  else if (count > 1) parts.push(`${count} divisions edited`);
  return parts.join(" · ");
}

function shiftIsoDays(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(utc.getTime())) return "";
  utc.setUTCDate(utc.getUTCDate() + days);
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameWindow(left: { oldest: string; youngest: string }, right: { oldest: string; youngest: string }): boolean {
  return Boolean(left.oldest) && left.oldest === right.oldest && left.youngest === right.youngest;
}

/**
 * Keep one division's oldest on or before its youngest. An empty value clears
 * the override. Neighboring divisions are not a bound.
 */
function boundedEdgeValue(
  division: DivisionAgeConfig,
  field: "oldestBirthdate" | "youngestBirthdate",
  value: string,
  cutoffIso: string,
): string {
  if (!value) return value;
  const range = effectiveRange(division, cutoffIso);
  if (field === "oldestBirthdate" && range.youngest && value > range.youngest) return range.youngest;
  if (field === "youngestBirthdate" && range.oldest && value < range.oldest) return range.oldest;
  return value;
}

export type LinkEditOptions = {
  /** This gesture does not pull a touching neighbor. Same-window divisions still move. */
  unlinkTouching?: boolean;
  /** Boundary keys from {@link touchingBoundaryKey} that stay independent. */
  unlinked?: ReadonlySet<string>;
};

/**
 * Stable id for the shared line between an older division and the next one.
 * Older code, then younger code.
 */
export function touchingBoundaryKey(olderCode: string, youngerCode: string): string {
  return `${olderCode}>${youngerCode}`;
}

/**
 * Click a lock to open that shared line, or click again to join it.
 * Joined means every older/younger pair is absent from the set.
 */
export function toggleTouchingBoundary(
  unlinked: ReadonlySet<string>,
  olderCodes: readonly string[],
  youngerCodes: readonly string[],
): Set<string> {
  const keys = olderCodes.flatMap((older) => youngerCodes.map((younger) => touchingBoundaryKey(older, younger)));
  const joined = keys.length > 0 && keys.every((key) => !unlinked.has(key));
  const next = new Set(unlinked);
  for (const key of keys) {
    if (joined) next.add(key);
    else next.delete(key);
  }
  return next;
}

function windowsOverlap(
  left: { oldest: string; youngest: string },
  right: { oldest: string; youngest: string },
): boolean {
  if (!left.oldest || !left.youngest || !right.oldest || !right.youngest) return false;
  if (left.oldest > left.youngest || right.oldest > right.youngest) return false;
  return left.oldest <= right.youngest && right.oldest <= left.youngest;
}

type TouchPartner = {
  index: number;
  code: string;
  range: { oldest: string; youngest: string };
};

/**
 * Divisions that meet this edge with no gap and no shared day.
 * An overlapping window (7/8 Majors across 7U and 8U, or an identical 6U pair)
 * is not a partner. Identical windows move together in {@link applyLinkedEdge}.
 */
function touchingPartners(
  divisions: readonly DivisionAgeConfig[],
  index: number,
  field: "oldestBirthdate" | "youngestBirthdate",
  cutoffIso: string,
): TouchPartner[] {
  const self = divisions[index];
  if (!self) return [];
  const range = effectiveRange(self, cutoffIso);
  if (!range.oldest || !range.youngest) return [];
  const partners: TouchPartner[] = [];
  divisions.forEach((division, divisionIndex) => {
    if (divisionIndex === index) return;
    const other = effectiveRange(division, cutoffIso);
    if (!other.oldest || !other.youngest || windowsOverlap(range, other)) return;
    const touches =
      field === "youngestBirthdate"
        ? shiftIsoDays(range.youngest, 1) === other.oldest
        : shiftIsoDays(other.youngest, 1) === range.oldest;
    if (!touches) return;
    partners.push({ index: divisionIndex, code: division.code, range: other });
  });
  return partners;
}

function clampToPartners(
  field: "oldestBirthdate" | "youngestBirthdate",
  date: string,
  partners: readonly TouchPartner[],
): string {
  let next = date;
  if (!next) return next;
  for (const partner of partners) {
    if (field === "oldestBirthdate") {
      const min = shiftIsoDays(partner.range.oldest, 1);
      if (min && next < min) next = min;
    } else {
      const max = shiftIsoDays(partner.range.youngest, -1);
      if (max && next > max) next = max;
    }
  }
  return next;
}

/**
 * Move one birthdate edge.
 *
 * With linking on, two rules apply:
 * 1. Same window. Divisions with the exact same oldest and youngest move that
 *    edge together (6U Major and 6U Minor).
 * 2. Touching ladder. When A's youngest is the day before B's oldest, that
 *    shared boundary stays joined: B starts on the new day and A ends the day
 *    before. Overlapping windows are not joined. A key in `unlinked`, or
 *    `unlinkTouching`, leaves that pair where it is so a gap can open.
 * With linking off, only the edited division changes.
 */
export function applyLinkedEdge(
  divisions: readonly DivisionAgeConfig[],
  index: number,
  field: "oldestBirthdate" | "youngestBirthdate",
  value: string,
  cutoffIso: string,
  linkEdges: boolean,
  options?: LinkEditOptions,
): DivisionAgeConfig[] {
  const current = divisions[index];
  if (!current) return divisions.map((division) => ({ ...division }));
  const unlinked = options?.unlinked;
  const partners =
    linkEdges && !options?.unlinkTouching
      ? touchingPartners(divisions, index, field, cutoffIso).filter((partner) => {
          const older = field === "youngestBirthdate" ? current.code : partner.code;
          const younger = field === "youngestBirthdate" ? partner.code : current.code;
          return !unlinked?.has(touchingBoundaryKey(older, younger));
        })
      : [];
  const bounded = clampToPartners(field, boundedEdgeValue(current, field, value, cutoffIso), partners);
  if (!linkEdges) {
    return divisions.map((division, divisionIndex) =>
      divisionIndex === index ? setDivisionBirthdate(division, field, bounded, cutoffIso) : { ...division },
    );
  }

  const before = effectiveRange(current, cutoffIso);
  const ordered = divisions
    .map((division, divisionIndex) => ({
      divisionIndex,
      range: effectiveRange(division, cutoffIso),
      sortOrder: division.sortOrder,
      code: division.code,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const selfPos = ordered.findIndex((item) => item.divisionIndex === index);
  let start = selfPos;
  let end = selfPos;
  if (selfPos >= 0 && before.oldest && before.youngest) {
    while (start > 0 && sameWindow(ordered[start - 1]!.range, before)) start -= 1;
    while (end + 1 < ordered.length && sameWindow(ordered[end + 1]!.range, before)) end += 1;
  }

  const updatedSelf = setDivisionBirthdate(current, field, bounded, cutoffIso);
  const updatedRange = effectiveRange(updatedSelf, cutoffIso);
  const nextEdge = field === "oldestBirthdate" ? updatedRange.oldest : updatedRange.youngest;
  const next = divisions.map((division) => ({ ...division }));
  if (!nextEdge || selfPos < 0) {
    next[index] = updatedSelf;
    return next;
  }

  const sameWindowIndexes = new Set<number>();
  for (let pos = start; pos <= end; pos += 1) {
    const item = ordered[pos]!;
    sameWindowIndexes.add(item.divisionIndex);
    next[item.divisionIndex] = setDivisionBirthdate(next[item.divisionIndex]!, field, nextEdge, cutoffIso);
  }
  const partnerEdge = field === "oldestBirthdate" ? shiftIsoDays(nextEdge, -1) : shiftIsoDays(nextEdge, 1);
  const partnerField = field === "oldestBirthdate" ? "youngestBirthdate" : "oldestBirthdate";
  if (partnerEdge) {
    for (const partner of partners) {
      if (sameWindowIndexes.has(partner.index)) continue;
      next[partner.index] = setDivisionBirthdate(next[partner.index]!, partnerField, partnerEdge, cutoffIso);
    }
  }
  return next;
}

export type DivisionEditResult =
  | { ok: true; divisions: DivisionAgeConfig[] }
  | { ok: false; error: string };

function orderedDivisions(divisions: readonly DivisionAgeConfig[]): DivisionAgeConfig[] {
  return [...divisions]
    .map((division) => ({ ...division }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}

function combinedCode(selected: readonly DivisionAgeConfig[]): string {
  const parsed = selected.map((division) => /^(\d+(?:-\d+)?)U(?:\s+(.*))?$/.exec(division.code.trim()));
  if (parsed.every((match) => match != null)) {
    const suffixes = parsed.map((match) => (match?.[2] ?? "").trim());
    if (suffixes.every((suffix) => suffix === suffixes[0])) {
      const ages = parsed.map((match) => match?.[1] ?? "");
      const suffix = suffixes[0] ? ` ${suffixes[0]}` : "";
      const code = `${ages.join("/")}U${suffix}`.trim();
      if (code.length <= 40) return code;
    }
  }
  const joined = selected.map((division) => division.code).join("/");
  if (joined.length <= 40) return joined;
  return `Combined ${selected.length}`.slice(0, 40);
}

function combinedLabel(selected: readonly DivisionAgeConfig[], code: string): string {
  const joined = selected.map((division) => division.label).join(" / ");
  if (joined.length > 0 && joined.length <= 80) return joined;
  return code.slice(0, 80);
}

/** Replace adjacent divisions with one division covering the union of their windows. */
export function combineDivisions(
  divisions: readonly DivisionAgeConfig[],
  codes: readonly string[],
  cutoffIso: string,
): DivisionEditResult {
  const wanted = new Set(codes);
  if (wanted.size < 2) return { ok: false, error: "Select at least two divisions to combine." };
  const ordered = orderedDivisions(divisions);
  const positions = ordered.flatMap((division, index) => (wanted.has(division.code) ? [index] : []));
  if (positions.length !== wanted.size) return { ok: false, error: "Those divisions are not in this list." };
  const first = positions[0]!;
  const last = positions[positions.length - 1]!;
  if (last - first + 1 !== positions.length) {
    return { ok: false, error: "Choose adjacent divisions with nothing between them." };
  }
  const selected = ordered.slice(first, last + 1);
  const remove = new Set(selected.map((division) => division.code));
  const code = combinedCode(selected);
  if (ordered.some((division) => division.code === code && !remove.has(division.code))) {
    return { ok: false, error: "A division with that combined code already exists." };
  }
  const ranges = selected.map((division) => effectiveRange(division, cutoffIso));
  const oldest = ranges.map((range) => range.oldest).filter(Boolean).sort()[0] ?? "";
  const youngest = ranges.map((range) => range.youngest).filter(Boolean).sort().at(-1) ?? "";
  let combined: DivisionAgeConfig = {
    code,
    label: combinedLabel(selected, code),
    minAge: Math.min(...selected.map((division) => division.minAge)),
    maxAge: Math.max(...selected.map((division) => division.maxAge)),
    sortOrder: selected[0]!.sortOrder,
  };
  const rosterMin = selected[0]?.rosterMin;
  const rosterMax = selected[0]?.rosterMax;
  if (
    rosterMin != null &&
    rosterMax != null &&
    selected.every((division) => division.rosterMin === rosterMin && division.rosterMax === rosterMax)
  ) {
    combined = { ...combined, rosterMin, rosterMax };
  }
  if (oldest) combined = setDivisionBirthdate(combined, "oldestBirthdate", oldest, cutoffIso);
  if (youngest) combined = setDivisionBirthdate(combined, "youngestBirthdate", youngest, cutoffIso);
  const next: DivisionAgeConfig[] = [];
  let inserted = false;
  for (const division of ordered) {
    if (remove.has(division.code)) {
      if (!inserted) {
        next.push(combined);
        inserted = true;
      }
      continue;
    }
    next.push(division);
  }
  return { ok: true, divisions: next };
}

function halfCode(code: string, half: "young" | "old"): string {
  const suffix = half === "young" ? " young" : " old";
  return `${code.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
}

function halfLabel(label: string, half: "younger" | "older"): string {
  const suffix = half === "younger" ? " (younger)" : " (older)";
  return `${label.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
}

/** Split one division at `splitOn`, the last birthdate of the older half. */
export function splitDivisionAt(
  divisions: readonly DivisionAgeConfig[],
  code: string,
  splitOn: string,
  cutoffIso: string,
): DivisionEditResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(splitOn)) {
    return { ok: false, error: "Enter the birthdate where the older half ends." };
  }
  const ordered = orderedDivisions(divisions);
  const current = ordered.find((division) => division.code === code);
  if (!current) return { ok: false, error: "Choose a division to split." };
  const range = effectiveRange(current, cutoffIso);
  if (!range.oldest || !range.youngest || range.oldest > range.youngest) {
    return { ok: false, error: "That division has no birthdate window to split." };
  }
  if (splitOn < range.oldest || splitOn >= range.youngest) {
    return { ok: false, error: "Pick a date inside the window, before the youngest birthdate." };
  }
  const youngerStart = shiftIsoDays(splitOn, 1);
  if (!youngerStart || youngerStart > range.youngest) {
    return { ok: false, error: "That date does not leave a younger half." };
  }
  const youngCode = halfCode(code, "young");
  const oldCode = halfCode(code, "old");
  if (
    youngCode === oldCode ||
    ordered.some((division) => division.code !== code && (division.code === youngCode || division.code === oldCode))
  ) {
    return { ok: false, error: "The split codes would collide with an existing division." };
  }
  const withoutDates = (division: DivisionAgeConfig): DivisionAgeConfig => {
    const next = { ...division };
    delete next.oldestBirthdate;
    delete next.youngestBirthdate;
    return next;
  };
  let younger = withoutDates({ ...current, code: youngCode, label: halfLabel(current.label, "younger"), sortOrder: current.sortOrder });
  let older = withoutDates({ ...current, code: oldCode, label: halfLabel(current.label, "older"), sortOrder: current.sortOrder + 1 });
  younger = withHalfAges(younger, youngerStart, range.youngest, cutoffIso);
  older = withHalfAges(older, range.oldest, splitOn, cutoffIso);
  younger = setDivisionBirthdate(younger, "oldestBirthdate", youngerStart, cutoffIso);
  younger = setDivisionBirthdate(younger, "youngestBirthdate", range.youngest, cutoffIso);
  older = setDivisionBirthdate(older, "oldestBirthdate", range.oldest, cutoffIso);
  older = setDivisionBirthdate(older, "youngestBirthdate", splitOn, cutoffIso);
  const next: DivisionAgeConfig[] = [];
  for (const division of ordered) {
    if (division.code === code) {
      next.push(younger, older);
      continue;
    }
    const sortOrder = division.sortOrder > current.sortOrder ? division.sortOrder + 1 : division.sortOrder;
    next.push({ ...division, sortOrder });
  }
  return { ok: true, divisions: next };
}

export type ScenarioLine = {
  code: string;
  label: string;
  oldest: string;
  youngest: string;
  pool: number;
  expected: number;
  minTeams: number;
  maxTeams: number;
};

export type StructuralScenario = {
  kind: "combine" | "split";
  beforeLabel: string;
  afterLabel: string;
  before: ScenarioLine[];
  after: ScenarioLine[];
  beforeTotal: ScenarioLine;
  afterTotal: ScenarioLine;
  /** False when an overlap reaches outside the group and the total can double-count. */
  exact: boolean;
};

function zeroSide(): ForecastSide {
  return { own: 0, feeder: 0, pool: 0, expected: 0, minTeams: 0, maxTeams: 0 };
}

function addForecastSide(left: ForecastSide, right: ForecastSide): ForecastSide {
  return {
    own: left.own + right.own,
    feeder: left.feeder + right.feeder,
    pool: left.pool + right.pool,
    expected: left.expected + right.expected,
    minTeams: left.minTeams + right.minTeams,
    maxTeams: left.maxTeams + right.maxTeams,
  };
}

function lineFrom(division: DivisionAgeConfig, side: ForecastSide, cutoffIso: string): ScenarioLine {
  const range = effectiveRange(division, cutoffIso);
  return {
    code: division.code,
    label: division.label,
    oldest: range.oldest,
    youngest: range.youngest,
    pool: side.pool,
    expected: side.expected,
    minTeams: side.minTeams,
    maxTeams: side.maxTeams,
  };
}

function summedLines(lines: readonly ScenarioLine[], code: string, label: string): ScenarioLine {
  return lines.reduce<ScenarioLine>(
    (total, line) => ({
      code,
      label,
      oldest: total.oldest && line.oldest ? (total.oldest < line.oldest ? total.oldest : line.oldest) : total.oldest || line.oldest,
      youngest: total.youngest && line.youngest ? (total.youngest > line.youngest ? total.youngest : line.youngest) : total.youngest || line.youngest,
      pool: total.pool + line.pool,
      expected: total.expected + line.expected,
      minTeams: total.minTeams + line.minTeams,
      maxTeams: total.maxTeams + line.maxTeams,
    }),
    { code, label, oldest: "", youngest: "", pool: 0, expected: 0, minTeams: 0, maxTeams: 0 },
  );
}

function rangesOverlap(
  left: { oldest: string; youngest: string },
  right: { oldest: string; youngest: string },
): boolean {
  if (!left.oldest || !left.youngest || !right.oldest || !right.youngest) return false;
  if (left.oldest > left.youngest || right.oldest > right.youngest) return false;
  return left.oldest <= right.youngest && right.oldest <= left.youngest;
}

function rangeContains(
  outer: { oldest: string; youngest: string },
  inner: { oldest: string; youngest: string },
): boolean {
  return Boolean(
    outer.oldest &&
      inner.oldest &&
      outer.oldest <= inner.oldest &&
      outer.youngest >= inner.youngest,
  );
}

function sameRange(
  left: { oldest: string; youngest: string },
  right: { oldest: string; youngest: string },
): boolean {
  return left.oldest === right.oldest && left.youngest === right.youngest;
}

/**
 * Count selected windows once. A window inside another selected window is
 * already included. Identical windows count once. A leftover partial overlap
 * can still double-count.
 */
function countDistinctWindows(
  members: readonly { window: { oldest: string; youngest: string }; side: ForecastSide }[],
): { sides: ForecastSide[]; exact: boolean } {
  const kept = members.filter(
    (member, index) =>
      !members.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          rangeContains(other.window, member.window) &&
          !rangeContains(member.window, other.window),
      ),
  );
  const unique: { window: { oldest: string; youngest: string }; side: ForecastSide }[] = [];
  for (const member of kept) {
    if (unique.some((item) => sameRange(item.window, member.window))) continue;
    unique.push(member);
  }
  const overlaps = unique.some((left, index) =>
    unique.some((right, otherIndex) => otherIndex > index && rangesOverlap(left.window, right.window)),
  );
  return { sides: unique.map((item) => item.side), exact: !overlaps };
}

function agesForWindow(
  oldest: string,
  youngest: string,
  cutoffIso: string,
): { minAge: number; maxAge: number } | null {
  const minAge = leagueAge(youngest, cutoffIso);
  const maxAge = leagueAge(oldest, cutoffIso);
  if (!Number.isInteger(minAge) || !Number.isInteger(maxAge) || minAge < 0 || maxAge < minAge) return null;
  return { minAge, maxAge };
}

function withHalfAges(
  division: DivisionAgeConfig,
  oldest: string,
  youngest: string,
  cutoffIso: string,
): DivisionAgeConfig {
  const ages = agesForWindow(oldest, youngest, cutoffIso);
  if (!ages) return division;
  return { ...division, minAge: ages.minAge, maxAge: ages.maxAge };
}

function distinctGroupSide(
  rows: readonly ForecastRow[],
  pools: readonly SharedPool[],
  codes: readonly string[],
  side: "current" | "proposed",
  windows: ReadonlyMap<string, { oldest: string; youngest: string }>,
): { side: ForecastSide; exact: boolean } {
  const set = new Set(codes);
  const presentKey = side === "current" ? "inCurrent" : "inProposed";
  const sharedKey = side === "current" ? "currentSharedPoolId" : "proposedSharedPoolId";
  const present = rows.filter((row) => set.has(row.code) && row[presentKey]);
  let total = zeroSide();
  let exact = true;
  const byPool = new Map<string, ForecastRow[]>();
  for (const row of present) {
    const poolId = row[sharedKey];
    if (!poolId) {
      total = addForecastSide(total, row[side]);
      continue;
    }
    const list = byPool.get(poolId);
    if (list) list.push(row);
    else byPool.set(poolId, [row]);
  }
  for (const [id, members] of byPool) {
    const pool = pools.find((item) => item.poolKey === id);
    const poolSide = pool?.[side];
    if (pool && poolSide && pool.codes.every((code) => set.has(code))) {
      total = addForecastSide(total, poolSide);
      continue;
    }
    const windowed = members.map((row) => ({
      window: windows.get(row.code) ?? { oldest: "", youngest: "" },
      side: row[side],
    }));
    if (windowed.some((item) => !item.window.oldest || !item.window.youngest)) {
      exact = false;
      for (const row of members) total = addForecastSide(total, row[side]);
      continue;
    }
    const counted = countDistinctWindows(windowed);
    if (!counted.exact) exact = false;
    for (const item of counted.sides) total = addForecastSide(total, item);
  }
  return { side: total, exact };
}

/**
 * Current separate divisions vs a proposed combine, or one division vs a proposed split.
 * Other proposed edits return null.
 */
export function structuralScenario(
  baseline: ProposedConfig,
  proposed: ProposedConfig,
  forecast: Pick<ForecastResponse, "rows" | "sharedPools">,
  targetSeason: number,
): StructuralScenario | null {
  const baselineCodes = new Set(baseline.divisions.map((division) => division.code));
  const proposedCodes = new Set(proposed.divisions.map((division) => division.code));
  const removed = baseline.divisions.filter((division) => !proposedCodes.has(division.code));
  const added = proposed.divisions.filter((division) => !baselineCodes.has(division.code));
  const kind = removed.length >= 2 && added.length === 1 ? "combine" : removed.length === 1 && added.length === 2 ? "split" : null;
  if (!kind) return null;
  const beforeCutoff = seasonCutoffIso(baseline.cutoff, targetSeason);
  const afterCutoff = seasonCutoffIso(proposed.cutoff, targetSeason);
  const rowByCode = new Map(forecast.rows.map((row) => [row.code, row]));
  const before = removed
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((division) => lineFrom(division, rowByCode.get(division.code)?.current ?? zeroSide(), beforeCutoff));
  const after = added
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((division) => lineFrom(division, rowByCode.get(division.code)?.proposed ?? zeroSide(), afterCutoff));
  const beforeName = kind === "combine" ? "Separate total" : "Unsplit";
  const afterName = kind === "combine" ? "Combined" : "Split total";
  const beforeWindows = new Map(
    removed.map((division) => {
      const range = effectiveRange(division, beforeCutoff);
      return [division.code, { oldest: range.oldest, youngest: range.youngest }] as const;
    }),
  );
  const afterWindows = new Map(
    added.map((division) => {
      const range = effectiveRange(division, afterCutoff);
      return [division.code, { oldest: range.oldest, youngest: range.youngest }] as const;
    }),
  );
  const beforeDistinct = distinctGroupSide(
    forecast.rows,
    forecast.sharedPools,
    removed.map((division) => division.code),
    "current",
    beforeWindows,
  );
  const afterDistinct = distinctGroupSide(
    forecast.rows,
    forecast.sharedPools,
    added.map((division) => division.code),
    "proposed",
    afterWindows,
  );
  const beforeTotal = summedLines(before, "before", beforeName);
  const afterTotal = summedLines(after, "after", afterName);
  return {
    kind,
    beforeLabel: kind === "combine" ? "Separate" : "Unsplit",
    afterLabel: kind === "combine" ? "Combined" : "Split",
    before,
    after,
    beforeTotal: {
      ...beforeTotal,
      pool: beforeDistinct.side.pool,
      expected: beforeDistinct.side.expected,
      minTeams: beforeDistinct.side.minTeams,
      maxTeams: beforeDistinct.side.maxTeams,
    },
    afterTotal: {
      ...afterTotal,
      pool: afterDistinct.side.pool,
      expected: afterDistinct.side.expected,
      minTeams: afterDistinct.side.minTeams,
      maxTeams: afterDistinct.side.maxTeams,
    },
    exact: beforeDistinct.exact && afterDistinct.exact,
  };
}

export function eligibilityShown(side: EligibilitySide, includeFeeder: boolean): number {
  return includeFeeder ? side.own + side.feeder : side.own;
}

export function eligibilityTooltip(side: EligibilitySide): string {
  return `Own ${side.own}, feeder ${side.feeder} (raw, before share).`;
}

function formatApproxCount(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (!Number.isFinite(rounded)) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function whereKidsMoveLines(
  flows: readonly ForecastFlow[],
  options: { includeFeeder: boolean; feederShare: number },
): string[] {
  const lines: { count: number; text: string }[] = [];
  for (const flow of flows) {
    if (flow.own > 0) {
      lines.push({ count: flow.own, text: `${flow.own} own: ${flow.from} → ${flow.to}` });
    }
    if (options.includeFeeder && flow.feeder > 0) {
      const pct = formatRetentionPercent(options.feederShare);
      const approx = formatApproxCount(flow.feeder * options.feederShare);
      lines.push({
        count: flow.feeder,
        text: `${flow.feeder} feeder (×${pct}% share ≈ ${approx}): ${flow.from} → ${flow.to}`,
      });
    }
  }
  lines.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  return lines.map((line) => line.text);
}

function joinCodes(codes: readonly string[]): string {
  if (codes.length === 0) return "divisions";
  if (codes.length === 1) return codes[0]!;
  if (codes.length === 2) return `${codes[0]} and ${codes[1]}`;
  return `${codes.slice(0, -1).join(", ")}, and ${codes[codes.length - 1]}`;
}

export function betweenDivisionCount(split: PoolSplit, includeFeeder: boolean): number {
  return includeFeeder ? split.total : split.own;
}

export function gapWarningText(
  warnings: readonly CoverageWarning[],
  unmatched: PoolSplit,
  includeFeeder: boolean,
): string | null {
  const gaps = warnings.filter((warning) => warning.kind === "gap");
  const count = betweenDivisionCount(unmatched, includeFeeder);
  if (gaps.length === 0 && count <= 0) return null;
  const splitNote = includeFeeder && unmatched.feeder > 0 ? ` (${unmatched.own} own, ${unmatched.feeder} feeder)` : "";
  if (gaps.length === 0) return `${count} players are not in a division and are not counted${splitNote}.`;
  if (gaps.length === 1) {
    const gap = gaps[0]!;
    return `${count} players fall between ${joinCodes(gap.divisionCodes)} (${gap.from}..${gap.to}) and are not counted${splitNote}.`;
  }
  const spans = gaps.map((gap) => `${joinCodes(gap.divisionCodes)} (${gap.from}..${gap.to})`).join("; ");
  return `${count} players fall between divisions and are not counted${splitNote}: ${spans}.`;
}

export function newOverlapMessages(
  currentWarnings: readonly CoverageWarning[],
  proposedWarnings: readonly CoverageWarning[],
): string[] {
  const existing = new Set(
    currentWarnings
      .filter((warning) => warning.kind === "overlap")
      .map((warning) => [...warning.divisionCodes].sort().join("+")),
  );
  return proposedWarnings
    .filter((warning) => warning.kind === "overlap" && !existing.has([...warning.divisionCodes].sort().join("+")))
    .map((warning) => `New overlap: ${joinCodes(warning.divisionCodes)} (${warning.from}..${warning.to}).`);
}

export function moverCellCount(split: PoolSplit, includeFeeder: boolean): number {
  return includeFeeder ? split.total : split.own;
}

export function moverTooltip(moversIn: PoolSplit, moversOut: PoolSplit): string {
  return `In: own ${moversIn.own}, feeder ${moversIn.feeder}. Out: own ${moversOut.own}, feeder ${moversOut.feeder}.`;
}

export function buildForecastRequest(input: {
  sourceSeason: number;
  targetSeason: number;
  includeFeeder: boolean;
  retentionOverride: number | null;
  proposed: ProposedConfig | null;
}): {
  seasonYear: number;
  targetSeasonYear: number;
  includeFeeder: boolean;
  retentionRate?: number;
  proposed?: ProposedConfig;
} {
  const body: {
    seasonYear: number;
    targetSeasonYear: number;
    includeFeeder: boolean;
    retentionRate?: number;
    proposed?: ProposedConfig;
  } = {
    seasonYear: input.sourceSeason,
    targetSeasonYear: input.targetSeason,
    includeFeeder: input.includeFeeder,
  };
  if (input.retentionOverride != null) body.retentionRate = input.retentionOverride;
  if (input.proposed) body.proposed = cloneProposed(input.proposed);
  return body;
}

export function forecastQueryKey(org: string, body: unknown): string {
  return `${org}:${JSON.stringify(body)}`;
}

export function dataSourceLabel(source: "enrollment" | "roster"): string {
  return source === "enrollment" ? "Enrollment" : "Roster";
}

export function coverageLabel(pct: number | null, dated: number, players: number): string {
  if (pct == null || players === 0) return "No dated players";
  return `${pct}% (${dated} of ${players})`;
}

export function carryoverReferenceLabel(
  org: ContentOrgId,
  seasonYear: number,
  carryover: { rate: number | null },
): string {
  if (carryover.rate != null && Number.isFinite(carryover.rate)) {
    return `Spring\u2192Fall ${seasonYear} carryover: ${formatRetentionPercent(carryover.rate)}%, reference only`;
  }
  const published =
    org === "gonzales" ? FALLBACK_RETENTION.gonzales : org === "ascension" ? FALLBACK_RETENTION.ascension : null;
  if (published != null) {
    return `Spring\u2192Fall 2026 carryover: ${formatRetentionPercent(published)}%, reference only`;
  }
  return "Spring\u2192Fall carryover is reference only.";
}

export function retentionSourceLabel(source: ForecastResponse["retention"]["source"]): string {
  if (source === "override") return "Using the percent entered for this session.";
  if (source === "league") return "Using the league return rate.";
  return "Using the default return rate of 100%.";
}

export function populationTotal(split: ForecastPopulation["distinctTotal"]): number {
  return split.total;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSide(value: unknown): value is ForecastSide {
  if (!isRecord(value)) return false;
  return (
    typeof value.own === "number" &&
    typeof value.feeder === "number" &&
    typeof value.pool === "number" &&
    typeof value.expected === "number" &&
    typeof value.minTeams === "number" &&
    typeof value.maxTeams === "number"
  );
}

export function isForecastResponse(value: unknown): value is ForecastResponse {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.rows) || !value.rows.every(isForecastRow)) return false;
  if (!isRecord(value.retention) || typeof value.retention.applied !== "number" || typeof value.retention.source !== "string") {
    return false;
  }
  if (value.source !== "enrollment" && value.source !== "roster") return false;
  if (!Array.isArray(value.notes) || !value.notes.every((note) => typeof note === "string")) return false;
  if (!isRecord(value.carryover) || typeof value.carryover.springDistinct !== "number" || typeof value.carryover.carried !== "number") {
    return false;
  }
  if (!isRecord(value.current) || !isPopulation(value.current)) return false;
  if (!isRecord(value.proposed) || !isPopulation(value.proposed)) return false;
  if (!isRecord(value.league) || !isSide(value.league.current) || !isSide(value.league.proposed)) return false;
  if (!Array.isArray(value.sharedPools) || !value.sharedPools.every(isSharedPool)) return false;
  if (typeof value.feederShare !== "number") return false;
  if (!isRecord(value.sources) || !isPoolSource(value.sources.own) || !isPoolSource(value.sources.feeder)) return false;
  if (typeof value.coveragePct !== "number" && value.coveragePct !== null) return false;
  if (value.currentSource !== "season" && value.currentSource !== "league" && value.currentSource !== "builtin") return false;
  if (!Array.isArray(value.flows) || !value.flows.every(isFlow)) return false;
  if (!Array.isArray(value.currentWarnings) || !value.currentWarnings.every(isCoverageWarning)) return false;
  if (!Array.isArray(value.proposedWarnings) || !value.proposedWarnings.every(isCoverageWarning)) return false;
  if (!Array.isArray(value.eligibility) || !value.eligibility.every(isEligibility)) return false;
  return typeof value.movers === "number" && typeof value.seasonYear === "number" && typeof value.includeFeeder === "boolean";
}

function isEligibilitySide(value: unknown): value is EligibilitySide {
  return isRecord(value) && typeof value.own === "number" && typeof value.feeder === "number";
}

function isEligibility(value: unknown): value is EligibilityContrast {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    typeof value.label === "string" &&
    typeof value.minAge === "number" &&
    typeof value.maxAge === "number" &&
    typeof value.llOldest === "string" &&
    typeof value.llYoungest === "string" &&
    typeof value.dybOldest === "string" &&
    typeof value.dybYoungest === "string" &&
    isEligibilitySide(value.ll) &&
    isEligibilitySide(value.dyb) &&
    isEligibilitySide(value.both) &&
    isEligibilitySide(value.llOnly) &&
    isEligibilitySide(value.dybOnly)
  );
}

function isSplit(value: unknown): boolean {
  return isRecord(value) && typeof value.total === "number";
}

function isPoolSplit(value: unknown): value is PoolSplit {
  return isRecord(value) && typeof value.own === "number" && typeof value.feeder === "number" && typeof value.total === "number";
}

function isFlow(value: unknown): value is ForecastFlow {
  return isRecord(value) && typeof value.from === "string" && typeof value.to === "string" && isPoolSplit(value);
}

function isCoverageWarning(value: unknown): value is CoverageWarning {
  if (!isRecord(value)) return false;
  return (
    (value.kind === "gap" || value.kind === "overlap" || value.kind === "invalid") &&
    typeof value.from === "string" &&
    typeof value.to === "string" &&
    Array.isArray(value.divisionCodes) &&
    value.divisionCodes.every((code) => typeof code === "string")
  );
}

function isPopulation(value: Record<string, unknown>): boolean {
  return isSplit(value.distinctTotal) && isSplit(value.tooYoung) && isSplit(value.agedOut) && isSplit(value.unmatched);
}

function isPoolSource(value: unknown): boolean {
  return isRecord(value) && typeof value.players === "number" && typeof value.datedPlayers === "number";
}

function isSharedPool(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.poolKey !== "string" || typeof value.label !== "string" || !Array.isArray(value.codes)) return false;
  if (value.current != null && !isSide(value.current)) return false;
  if (value.proposed != null && !isSide(value.proposed)) return false;
  return true;
}

function isForecastRow(value: unknown): value is ForecastRow {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    typeof value.label === "string" &&
    isSide(value.current) &&
    isSide(value.proposed) &&
    isSide(value.delta) &&
    isPoolSplit(value.moversIn) &&
    isPoolSplit(value.moversOut)
  );
}
