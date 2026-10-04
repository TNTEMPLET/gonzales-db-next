/**
 * Client-safe forecast tab helpers. Counts and division labels only.
 * Nothing here accepts or returns a player name, birthdate list, or contact.
 */

import type { ContentOrgId } from "@/lib/siteConfig";

import { effectiveRange } from "./compute";
import { setDivisionBirthdate } from "./draft";
import {
  DEFAULT_RETURN_RATE,
  FALLBACK_RETENTION,
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
  return { ...config, cutoff: { ...config.cutoff, ...patch } };
}

export function forecastDraftKey(org: string, targetSeason: number): string {
  return `${org}|${targetSeason}`;
}

export function sameProposedConfig(a: ProposedConfig, b: ProposedConfig): boolean {
  return JSON.stringify(cloneProposed(a)) === JSON.stringify(cloneProposed(b));
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
 * Apply one edge edit. With linking on, shared-window siblings move together
 * and the neighboring division's touching edge moves to the adjacent day.
 */
export function applyLinkedEdge(
  divisions: readonly DivisionAgeConfig[],
  index: number,
  field: "oldestBirthdate" | "youngestBirthdate",
  value: string,
  cutoffIso: string,
  linkEdges: boolean,
): DivisionAgeConfig[] {
  const current = divisions[index];
  if (!current) return divisions.map((division) => ({ ...division }));
  if (!linkEdges) {
    return divisions.map((division, divisionIndex) =>
      divisionIndex === index ? setDivisionBirthdate(division, field, value, cutoffIso) : { ...division },
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

  const updatedSelf = setDivisionBirthdate(current, field, value, cutoffIso);
  const updatedRange = effectiveRange(updatedSelf, cutoffIso);
  const nextEdge = field === "oldestBirthdate" ? updatedRange.oldest : updatedRange.youngest;
  const next = divisions.map((division) => ({ ...division }));
  if (!nextEdge || selfPos < 0) {
    next[index] = updatedSelf;
    return next;
  }

  for (let pos = start; pos <= end; pos += 1) {
    const item = ordered[pos]!;
    next[item.divisionIndex] = setDivisionBirthdate(next[item.divisionIndex]!, field, nextEdge, cutoffIso);
  }

  if (field === "youngestBirthdate") {
    const neighborPos = start - 1;
    if (neighborPos >= 0) {
      const neighborRange = ordered[neighborPos]!.range;
      let neighborStart = neighborPos;
      while (neighborStart > 0 && sameWindow(ordered[neighborStart - 1]!.range, neighborRange)) neighborStart -= 1;
      const dayAfter = shiftIsoDays(nextEdge, 1);
      if (dayAfter) {
        for (let pos = neighborStart; pos <= neighborPos; pos += 1) {
          const item = ordered[pos]!;
          next[item.divisionIndex] = setDivisionBirthdate(next[item.divisionIndex]!, "oldestBirthdate", dayAfter, cutoffIso);
        }
      }
    }
  } else if (end + 1 < ordered.length) {
    const neighborPos = end + 1;
    const neighborRange = ordered[neighborPos]!.range;
    let neighborEnd = neighborPos;
    while (neighborEnd + 1 < ordered.length && sameWindow(ordered[neighborEnd + 1]!.range, neighborRange)) neighborEnd += 1;
    const dayBefore = shiftIsoDays(nextEdge, -1);
    if (dayBefore) {
      for (let pos = neighborPos; pos <= neighborEnd; pos += 1) {
        const item = ordered[pos]!;
        next[item.divisionIndex] = setDivisionBirthdate(next[item.divisionIndex]!, "youngestBirthdate", dayBefore, cutoffIso);
      }
    }
  }
  return next;
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
  return typeof value.movers === "number" && typeof value.seasonYear === "number" && typeof value.includeFeeder === "boolean";
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
