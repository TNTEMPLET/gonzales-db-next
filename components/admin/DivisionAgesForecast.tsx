"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { SpringLeagueTable } from "@/lib/admin/springCombined/save";
import {
  combinedForecastConfig,
  SPRING_COMBINED_SAVE_HINT,
  SPRING_LEAGUE_ORGS,
} from "@/lib/admin/springCombined/view";
import { effectiveRange } from "@/lib/ageDivisions/compute";
import {
  divisionAgesSourceLabel,
  seasonCutoffIso,
} from "@/lib/ageDivisions/draft";
import type { ForecastSide } from "@/lib/ageDivisions/forecast";
import { applyAgeSpan, type TimelineEdge } from "@/lib/ageDivisions/forecastTimeline";
import { DivisionAgesCutoffImpact } from "@/components/admin/DivisionAgesCutoffImpact";
import { SpringCombinedSavePanel } from "@/components/admin/SpringCombinedSavePanel";
import { DivisionAgesForecastTimeline, type TimelineCount } from "@/components/admin/DivisionAgesForecastTimeline";
import { forecastTimelineLayout, springLeagueFallback } from "@/lib/ageDivisions/springTimeline";
import {
  FORECAST_CAVEATS,
  FORECAST_DEBOUNCE_MS,
  applyLinkedEdge,
  betweenDivisionCount,
  buildForecastRequest,
  carryoverReferenceLabel,
  cloneProposed,
  combineDivisions,
  coverageLabel,
  dataSourceLabel,
  defaultIncludeFeeder,
  defaultRetentionText,
  editedDivisionCodes,
  eligibilityShown,
  eligibilityTooltip,
  forecastDraftKey,
  forecastEditedSummary,
  forecastQueryKey,
  forecastSeasonChoices,
  formatDelta,
  formatDeltaTeams,
  formatRetentionPercent,
  formatTeamRange,
  gapWarningText,
  isForecastResponse,
  moverCellCount,
  moverTooltip,
  newOverlapMessages,
  parseRetentionPercent,
  populationTotal,
  retentionSourceLabel,
  splitDivisionAt,
  structuralScenario,
  toggleTouchingBoundary,
  sameProposedConfig,
  shownRetentionPercent,
  storedDraftAction,
  whereKidsMoveLines,
  withProposedCutoff,
  type ForecastResponse,
  type ProposedConfig,
} from "@/lib/ageDivisions/forecastView";
import type { DivisionAgesSource } from "@/lib/ageDivisions/schema";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";
import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";

const FORECAST_MAX_WAIT_MS = 400;

const fieldClass =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-white";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-60";
const DRAFT_PREFIX = "gonzales-forecast-draft:v1:";
const EMPTY_UNLINKED = new Set<string>();

function dateFieldClass(overridden: boolean): string {
  return overridden
    ? "min-h-11 w-full rounded-xl border border-sky-400 bg-zinc-950 px-3 text-base text-white"
    : "min-h-11 w-full rounded-xl border border-dashed border-zinc-600 bg-zinc-950 px-3 text-base text-zinc-300";
}

function isStoredProposed(value: unknown): value is ProposedConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as {
    cutoff?: { cutoffMonth?: unknown; cutoffDay?: unknown; yearOffset?: unknown };
    divisions?: unknown;
  };
  if (!record.cutoff || typeof record.cutoff !== "object") return false;
  if (typeof record.cutoff.cutoffMonth !== "number" || typeof record.cutoff.cutoffDay !== "number") return false;
  if (typeof record.cutoff.yearOffset !== "number" || !Array.isArray(record.divisions)) return false;
  return record.divisions.every((division) => {
    if (!division || typeof division !== "object") return false;
    const row = division as DivisionAgeConfig;
    return typeof row.code === "string" && typeof row.label === "string" && typeof row.sortOrder === "number";
  });
}

function readStoredDraft(
  org: string,
  targetSeason: number,
  memory: Map<string, ProposedConfig>,
): ProposedConfig | null {
  const key = forecastDraftKey(org, targetSeason);
  const cached = memory.get(key);
  if (cached) return cloneProposed(cached);
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredProposed(parsed)) return null;
    const cloned = cloneProposed(parsed);
    memory.set(key, cloned);
    return cloneProposed(cloned);
  } catch {
    return null;
  }
}

function writeStoredDraft(
  org: string,
  targetSeason: number,
  proposed: ProposedConfig | null,
  baseline: ProposedConfig | null,
  memory: Map<string, ProposedConfig>,
): void {
  const key = forecastDraftKey(org, targetSeason);
  const storageKey = DRAFT_PREFIX + key;
  const action = storedDraftAction(proposed, baseline);
  if (action === "retain") return;
  if (action === "delete" || !proposed) {
    memory.delete(key);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* private mode or a full quota */
    }
    return;
  }
  const cloned = cloneProposed(proposed);
  memory.set(key, cloned);
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(cloned));
  } catch {
    /* private mode or a full quota */
  }
}

function readError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return fallback;
}

function EmptySideCells() {
  return (
    <>
      <td className="py-2 pr-3 align-top text-zinc-500">—</td>
      <td className="py-2 pr-3 align-top text-zinc-500">—</td>
      <td className="py-2 pr-3 align-top text-zinc-500">—</td>
    </>
  );
}

function SideCells({
  side,
  shortRoster,
  includeFeeder,
}: {
  side: ForecastSide;
  shortRoster: boolean;
  includeFeeder: boolean;
}) {
  const feederNote = includeFeeder ? "" : " (not in the pool)";
  return (
    <>
      <td className="py-2 pr-3 align-top" title={`Own ${side.own}. Feeder ${side.feeder}.`}>
        <details>
          <summary className="cursor-pointer tabular-nums">{side.pool}</summary>
          <p className="mt-1 text-xs text-zinc-400">Own {side.own}</p>
          <p className="text-xs text-zinc-400">
            Feeder {side.feeder}
            {feederNote}
          </p>
        </details>
      </td>
      <td className="py-2 pr-3 align-top tabular-nums">{side.expected}</td>
      <td className="py-2 pr-3 align-top">
        <span className="tabular-nums" data-testid="team-range">
          {formatTeamRange(side.minTeams, side.maxTeams)}
        </span>
        {shortRoster ? (
          <span className="ml-2 inline-flex rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
            Short roster
          </span>
        ) : null}
      </td>
    </>
  );
}

export function DivisionAgesForecastView({
  org,
  orgs,
  seasonYears,
  sourceSeason,
  targetSeason,
  includeFeeder,
  retentionText,
  retentionDirty,
  retentionError,
  appliedRetention,
  retentionHint,
  proposed,
  baseline,
  currentSourceLabel,
  forecast,
  loading,
  error,
  configError,
  linkEdges,
  editedCodes,
  editedSummary,
  impactCounted = null,
  impactPending = false,
  impactStale = false,
  onOrg,
  onSourceSeason,
  onTargetSeason,
  onIncludeFeeder,
  onRetentionText,
  onResetRetention,
  onCutoff,
  onDivisions,
  onLinkEdges,
  onResetProposed,
  onReplace = () => {},
  springCombined = false,
  unlinkedBoundaries = EMPTY_UNLINKED,
  onToggleBoundary = () => {},
  springLeagues = [],
  springSavedNote = null,
  onSpringSaved = () => {},
}: {
  org: ContentOrgId;
  orgs: ContentOrgId[];
  seasonYears: number[];
  sourceSeason: number;
  targetSeason: number;
  includeFeeder: boolean;
  retentionText: string;
  retentionDirty: boolean;
  retentionError: string | null;
  appliedRetention: number | null;
  retentionHint: string | null;
  proposed: ProposedConfig | null;
  baseline: ProposedConfig | null;
  currentSourceLabel: string | null;
  forecast: ForecastResponse | null;
  loading: boolean;
  error: string | null;
  configError: string | null;
  linkEdges: boolean;
  editedCodes: readonly string[];
  editedSummary: string;
  /** Proposed table that the loaded forecast belongs to. Null while the first count is in flight. */
  impactCounted?: ProposedConfig | null;
  impactPending?: boolean;
  impactStale?: boolean;
  onOrg: (org: ContentOrgId) => void;
  onSourceSeason: (year: number) => void;
  onTargetSeason: (year: number) => void;
  onIncludeFeeder: (value: boolean) => void;
  onRetentionText: (value: string) => void;
  onResetRetention: () => void;
  onCutoff: (patch: Partial<LeagueAgeRule>) => void;
  onDivisions: (divisions: DivisionAgeConfig[]) => void;
  onLinkEdges: (value: boolean) => void;
  onResetProposed: () => void;
  onReplace?: (next: ProposedConfig) => void;
  /** Master combined Spring. One save writes both league tables. */
  springCombined?: boolean;
  unlinkedBoundaries?: ReadonlySet<string>;
  onToggleBoundary?: (edge: TimelineEdge) => void;
  springLeagues?: readonly SpringLeagueTable[];
  springSavedNote?: string | null;
  onSpringSaved?: (message: string) => void;
}) {
  const linkOptions = { unlinked: unlinkedBoundaries };
  const retentionValue = shownRetentionPercent({
    dirty: retentionDirty,
    text: retentionText,
    applied: appliedRetention,
    org,
  });
  const cutoffIso = proposed ? seasonCutoffIso(proposed.cutoff, targetSeason) : "";
  const gapMessage = forecast
    ? gapWarningText(forecast.proposedWarnings, forecast.proposed.unmatched, forecast.includeFeeder)
    : null;
  const overlapMessages = forecast ? newOverlapMessages(forecast.currentWarnings, forecast.proposedWarnings) : [];
  const moveLines = forecast
    ? whereKidsMoveLines(forecast.flows, { includeFeeder: forecast.includeFeeder, feederShare: forecast.feederShare })
    : [];
  const [combineCodes, setCombineCodes] = useState<string[]>([]);
  const [splitCode, setSplitCode] = useState("");
  const [splitDate, setSplitDate] = useState("");
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const selectedCodes = proposed ? combineCodes.filter((code) => proposed.divisions.some((division) => division.code === code)) : [];
  const scenario =
    baseline && proposed && forecast ? structuralScenario(baseline, proposed, forecast, targetSeason) : null;
  const timelineCounts = useMemo<TimelineCount[] | null>(
    () =>
      forecast
        ? forecast.rows.map((row) => ({
            code: row.code,
            label: row.label,
            pool: row.proposed.pool,
            expected: row.proposed.expected,
            minTeams: row.proposed.minTeams,
            maxTeams: row.proposed.maxTeams,
          }))
        : null,
    [forecast],
  );
  const impactCounts = useMemo(
    () => (forecast ? { rows: forecast.rows, flows: forecast.flows, sharedPools: forecast.sharedPools } : null),
    [forecast],
  );

  function toggleCombine(code: string, checked: boolean) {
    setScenarioError(null);
    setCombineCodes((current) => {
      const without = current.filter((item) => item !== code);
      return checked ? [...without, code] : without;
    });
  }

  function onCombine() {
    if (!proposed) return;
    const result = combineDivisions(proposed.divisions, selectedCodes, cutoffIso);
    if (!result.ok) {
      setScenarioError(result.error);
      return;
    }
    setScenarioError(null);
    setCombineCodes([]);
    onDivisions(result.divisions);
  }

  function onSplit() {
    if (!proposed) return;
    const code = proposed.divisions.some((division) => division.code === splitCode)
      ? splitCode
      : proposed.divisions[0]?.code ?? "";
    const result = splitDivisionAt(proposed.divisions, code, splitDate, cutoffIso);
    if (!result.ok) {
      setScenarioError(result.error);
      return;
    }
    setScenarioError(null);
    onDivisions(result.divisions);
  }

  return (
    <div className="space-y-6" data-testid="forecast-tab">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300" data-testid="forecast-caveats">
          {FORECAST_CAVEATS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-zinc-500">
          {springCombined
            ? "Review the changes for Gonzales DYB and Ascension LL, then save both leagues. Team size comes from league defaults (11–12 unless Settings sets a roster size)."
            : "Proposed cutoffs stay in this browser. Save a real table from the Divisions tab. Team size comes from league defaults (11–12 unless Settings sets a roster size)."}
        </p>
        {springCombined ? (
          <p className="mt-3 text-sm text-amber-100" data-testid="spring-what-if">
            {springSavedNote ??
              `${SPRING_COMBINED_SAVE_HINT}. Gonzales DYB and Ascension LL share one forecast. A player in both leagues counts once.`}
          </p>
        ) : null}
        {springCombined && springLeagues.length > 0 ? (
          <div className="mt-4">
            <SpringCombinedSavePanel
              seasonYear={targetSeason}
              proposed={proposed}
              leagues={springLeagues}
              onSaved={onSpringSaved}
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!springCombined && orgs.length > 1 ? (
            <label className="block text-sm text-zinc-300">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Organization</span>
              <select className={fieldClass} value={org} onChange={(event) => onOrg(event.target.value as ContentOrgId)}>
                {orgs.map((id) => (
                  <option key={id} value={id}>
                    {getOrgDisplayName(id)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Source season</span>
            <select
              className={fieldClass}
              value={sourceSeason}
              onChange={(event) => onSourceSeason(Number(event.target.value))}
            >
              {seasonYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Target season</span>
            <select
              className={fieldClass}
              value={targetSeason}
              onChange={(event) => onTargetSeason(Number(event.target.value))}
            >
              {seasonYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Return rate %</span>
            <input
              className={fieldClass}
              inputMode="decimal"
              aria-label="Return rate percent"
              data-testid="retention-percent"
              value={retentionValue}
              onChange={(event) => onRetentionText(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {!springCombined && org === "gonzales" ? (
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-100">
              <input
                type="checkbox"
                data-testid="feeder-toggle"
                checked={includeFeeder}
                onChange={(event) => onIncludeFeeder(event.target.checked)}
              />
              Include Ascension feeder pool
            </label>
          ) : null}
          {!springCombined && org === "gonzales" && forecast ? (
            <p className="text-sm text-zinc-400" data-testid="feeder-share">
              Feeder share {formatRetentionPercent(forecast.feederShare)}%
            </p>
          ) : null}
          {retentionDirty ? (
            <button type="button" className={`${buttonClass} underline`} data-testid="retention-reset" onClick={onResetRetention}>
              Reset
            </button>
          ) : null}
          {retentionHint ? <p className="text-sm text-zinc-400">{retentionHint}</p> : null}
        </div>
        {retentionError ? <p className="mt-2 text-sm text-amber-200">{retentionError}</p> : null}
        {currentSourceLabel ? (
          <p className="mt-3 text-sm text-zinc-200" data-testid="forecast-current-source">
            Current config: {currentSourceLabel}
          </p>
        ) : null}
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Proposed cutoffs</h2>
            <p className="mt-1 text-sm text-zinc-400">Starts as a copy of the current table for {targetSeason}. Nothing here is saved.</p>
          </div>
          {editedSummary ? (
            <p className="text-sm text-violet-100" data-testid="edited-summary">
              {editedSummary}
            </p>
          ) : null}
        </div>
        {configError ? (
          <p className="mb-3 text-sm text-amber-200" role="status">
            {configError}
          </p>
        ) : null}
        {!proposed ? <p className="text-sm text-zinc-300">Loading the current division ages…</p> : null}
        {proposed ? (
          <div className="space-y-4">
            <DivisionAgesForecastTimeline
              proposed={proposed}
              baseline={baseline}
              targetSeason={targetSeason}
              linkEdges={linkEdges}
              counts={timelineCounts}
              countsLoading={loading}
              onDivisions={onDivisions}
              onCutoff={onCutoff}
              onReplace={onReplace}
              onLinkEdges={onLinkEdges}
              onReset={onResetProposed}
              unlinkedBoundaries={unlinkedBoundaries}
              onToggleBoundary={onToggleBoundary}
              combinedPresets={springCombined}
              layout={forecastTimelineLayout({ org, springCombined })}
              leagueFallback={springLeagueFallback({ org, springCombined })}
              impact={
                <DivisionAgesCutoffImpact
                  baseline={baseline}
                  proposed={proposed}
                  counted={impactCounted}
                  targetSeason={targetSeason}
                  counts={impactCounts}
                  pending={impactPending}
                  stale={impactStale}
                  onReset={onResetProposed}
                />
              }
            />
            <details className="rounded-xl border border-zinc-800" data-testid="precise-dates">
              <summary className="cursor-pointer px-3 py-3 text-sm font-semibold text-white">Precise dates</summary>
              <div className="space-y-3 px-3 pb-3">
              {proposed.divisions.map((division, index) => {
                const range = cutoffIso ? effectiveRange(division, cutoffIso) : null;
                const edited = editedCodes.includes(division.code);
                return (
                <div key={`proposed-division-${index}`} data-row-key={`proposed-division-${index}`} className="rounded-xl border border-zinc-800 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">
                      {division.label} <span className="font-normal text-zinc-500">{division.code}</span>
                      {edited ? (
                        <span className="ml-2 inline-flex rounded-full border border-violet-400/40 bg-violet-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-100" data-testid="division-edited">
                          edited
                        </span>
                      ) : null}
                    </p>
                    <label className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        data-testid={`combine-${index + 1}`}
                        checked={selectedCodes.includes(division.code)}
                        onChange={(event) => toggleCombine(division.code, event.target.checked)}
                      />
                      Combine
                    </label>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-sm text-zinc-300">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Min age</span>
                      <input
                        className={fieldClass}
                        aria-label={`Proposed minimum age ${index + 1}`}
                        inputMode="numeric"
                        value={division.minAge}
                        onChange={(event) => {
                          const minAge = Number(event.target.value);
                          if (!Number.isInteger(minAge)) return;
                          onDivisions(
                            applyAgeSpan(proposed.divisions, index, minAge, division.maxAge, cutoffIso, linkEdges, linkOptions),
                          );
                        }}
                      />
                    </label>
                    <label className="text-sm text-zinc-300">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Max age</span>
                      <input
                        className={fieldClass}
                        aria-label={`Proposed maximum age ${index + 1}`}
                        inputMode="numeric"
                        value={division.maxAge}
                        onChange={(event) => {
                          const maxAge = Number(event.target.value);
                          if (!Number.isInteger(maxAge)) return;
                          onDivisions(
                            applyAgeSpan(
                              proposed.divisions,
                              index,
                              division.minAge,
                              maxAge,
                              cutoffIso,
                              linkEdges,
                              linkOptions,
                            ),
                          );
                        }}
                      />
                    </label>
                    <label className="text-sm text-zinc-300">
                      <span className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                        Oldest
                        <span className={range?.oldestOverridden ? "text-sky-300" : "text-zinc-500"}>
                          {range?.oldestOverridden ? "override" : "calc"}
                        </span>
                      </span>
                      <input
                        type="date"
                        className={dateFieldClass(range?.oldestOverridden === true)}
                        aria-label={`Proposed oldest birthdate ${index + 1}`}
                        data-testid={`proposed-oldest-${index + 1}`}
                        value={range?.oldest ?? ""}
                        onChange={(event) =>
                          onDivisions(
                            applyLinkedEdge(
                              proposed.divisions,
                              index,
                              "oldestBirthdate",
                              event.target.value,
                              cutoffIso,
                              linkEdges,
                              linkOptions,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="text-sm text-zinc-300">
                      <span className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                        Youngest
                        <span className={range?.youngestOverridden ? "text-sky-300" : "text-zinc-500"}>
                          {range?.youngestOverridden ? "override" : "calc"}
                        </span>
                      </span>
                      <input
                        type="date"
                        className={dateFieldClass(range?.youngestOverridden === true)}
                        aria-label={`Proposed youngest birthdate ${index + 1}`}
                        data-testid={`proposed-youngest-${index + 1}`}
                        value={range?.youngest ?? ""}
                        onChange={(event) =>
                          onDivisions(
                            applyLinkedEdge(
                              proposed.divisions,
                              index,
                              "youngestBirthdate",
                              event.target.value,
                              cutoffIso,
                              linkEdges,
                              linkOptions,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
                );
              })}
            <div className="mt-4 flex flex-wrap items-end gap-3" data-testid="scenario-controls">
              <button
                type="button"
                className={buttonClass}
                data-testid="combine-divisions"
                disabled={selectedCodes.length < 2}
                onClick={onCombine}
              >
                Combine selected
              </button>
              <label className="text-sm text-zinc-300">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Split</span>
                <select
                  className={fieldClass}
                  data-testid="split-division"
                  value={proposed.divisions.some((division) => division.code === splitCode) ? splitCode : proposed.divisions[0]?.code ?? ""}
                  onChange={(event) => {
                    setScenarioError(null);
                    setSplitCode(event.target.value);
                  }}
                >
                  {proposed.divisions.map((division) => (
                    <option key={division.code} value={division.code}>
                      {division.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-zinc-300">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Older half ends</span>
                <input
                  type="date"
                  className={fieldClass}
                  data-testid="split-date"
                  value={splitDate}
                  onChange={(event) => {
                    setScenarioError(null);
                    setSplitDate(event.target.value);
                  }}
                />
              </label>
              <button type="button" className={buttonClass} data-testid="split-division-apply" onClick={onSplit}>
                Split division
              </button>
            </div>
            {scenarioError ? (
              <p className="mt-3 text-sm text-amber-200" role="alert" data-testid="scenario-error">
                {scenarioError}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-zinc-400">
              Combine adjacent divisions into one window, or split one division at a birthdate. The result stays in this
              browser until you reset it.
            </p>
              </div>
            </details>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6" aria-busy={loading}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-white">Current vs proposed</h2>
          {loading ? <p className="text-sm text-zinc-400">{forecast ? "Updating the forecast…" : "Loading the forecast…"}</p> : null}
        </div>
        {error ? (
          <p className="mb-3 text-sm text-amber-200" role="alert">
            {error}
          </p>
        ) : null}
        {forecast ? (
          <>
            {scenario ? (
              <div className="mb-4 rounded-xl border border-zinc-700 p-3" data-testid="structural-scenario">
                <h3 className="text-sm font-semibold text-white">
                  {scenario.kind === "combine" ? "Combined vs separate" : "Split vs unsplit"}
                </h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                      <tr>
                        <th className="py-1 pr-3">{scenario.beforeLabel}</th>
                        <th className="py-1 pr-3">Window</th>
                        <th className="py-1 pr-3">Players</th>
                        <th className="py-1 pr-3">Expected</th>
                        <th className="py-1 pr-3">Teams</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenario.before.map((line) => (
                        <tr key={`before-${line.code}`} data-testid="scenario-before">
                          <td className="py-1 pr-3 text-zinc-100">{line.label}</td>
                          <td className="py-1 pr-3 tabular-nums text-zinc-400">{line.oldest}..{line.youngest}</td>
                          <td className="py-1 pr-3 tabular-nums">{line.pool}</td>
                          <td className="py-1 pr-3 tabular-nums">{line.expected}</td>
                          <td className="py-1 pr-3 tabular-nums">{formatTeamRange(line.minTeams, line.maxTeams)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-zinc-800 font-semibold text-white" data-testid="scenario-before-total">
                        <td className="py-1 pr-3">{scenario.beforeTotal.label}</td>
                        <td className="py-1 pr-3 tabular-nums text-zinc-400">{scenario.beforeTotal.oldest}..{scenario.beforeTotal.youngest}</td>
                        <td className="py-1 pr-3 tabular-nums">{scenario.beforeTotal.pool}</td>
                        <td className="py-1 pr-3 tabular-nums">{scenario.beforeTotal.expected}</td>
                        <td className="py-1 pr-3 tabular-nums">{formatTeamRange(scenario.beforeTotal.minTeams, scenario.beforeTotal.maxTeams)}</td>
                      </tr>
                      {scenario.after.map((line) => (
                        <tr key={`after-${line.code}`} data-testid="scenario-after">
                          <td className="py-1 pr-3 text-zinc-100">{scenario.afterLabel}: {line.label}</td>
                          <td className="py-1 pr-3 tabular-nums text-zinc-400">{line.oldest}..{line.youngest}</td>
                          <td className="py-1 pr-3 tabular-nums">{line.pool}</td>
                          <td className="py-1 pr-3 tabular-nums">{line.expected}</td>
                          <td className="py-1 pr-3 tabular-nums">{formatTeamRange(line.minTeams, line.maxTeams)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-zinc-800 font-semibold text-white" data-testid="scenario-after-total">
                        <td className="py-1 pr-3">{scenario.afterTotal.label}</td>
                        <td className="py-1 pr-3 tabular-nums text-zinc-400">{scenario.afterTotal.oldest}..{scenario.afterTotal.youngest}</td>
                        <td className="py-1 pr-3 tabular-nums">{scenario.afterTotal.pool}</td>
                        <td className="py-1 pr-3 tabular-nums">{scenario.afterTotal.expected}</td>
                        <td className="py-1 pr-3 tabular-nums">{formatTeamRange(scenario.afterTotal.minTeams, scenario.afterTotal.maxTeams)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-sm text-zinc-200" data-testid="scenario-delta">
                  Δ players {formatDelta(scenario.afterTotal.pool - scenario.beforeTotal.pool)}. Δ teams{" "}
                  {formatDeltaTeams(
                    scenario.afterTotal.minTeams - scenario.beforeTotal.minTeams,
                    scenario.afterTotal.maxTeams - scenario.beforeTotal.maxTeams,
                  )}
                  .
                </p>
                {scenario.exact ? null : (
                  <p className="mt-1 text-sm text-amber-200" data-testid="scenario-double-count">
                    These divisions overlap on part of their windows, so this total can count a player twice.
                  </p>
                )}
              </div>
            ) : null}
            {gapMessage ? (
              <p className="mb-3 rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert" data-testid="gap-warning">
                {gapMessage}
              </p>
            ) : null}
            {overlapMessages.map((message) => (
              <p key={message} className="mb-3 rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm text-amber-100" role="status" data-testid="overlap-warning">
                {message}
              </p>
            ))}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[80rem] text-left text-sm" data-testid="forecast-table">
                <caption className="sr-only">Current and proposed division headcount. Counts only.</caption>
                <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3 font-semibold" rowSpan={2}>
                      Division
                    </th>
                    <th className="py-2 pr-3 text-center font-semibold" colSpan={3}>
                      Current
                    </th>
                    <th className="py-2 pr-3 text-center font-semibold" colSpan={3}>
                      Proposed
                    </th>
                    <th className="py-2 pr-3 font-semibold" rowSpan={2}>
                      Δ players
                    </th>
                    <th className="py-2 pr-3 font-semibold" rowSpan={2}>
                      Δ expected
                    </th>
                    <th className="py-2 pr-3 font-semibold" rowSpan={2}>
                      Δ teams
                    </th>
                    <th className="py-2 font-semibold" rowSpan={2}>
                      In / out
                    </th>
                  </tr>
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Pool</th>
                    <th className="py-2 pr-3 font-semibold">Expected</th>
                    <th className="py-2 pr-3 font-semibold">Teams</th>
                    <th className="py-2 pr-3 font-semibold">Pool</th>
                    <th className="py-2 pr-3 font-semibold">Expected</th>
                    <th className="py-2 pr-3 font-semibold">Teams</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.sharedPools.map((pool) => (
                    <tr key={pool.poolKey} className="border-t border-amber-400/30 bg-amber-400/5 text-zinc-100" data-testid="shared-pool">
                      <td className="py-2 pr-3 align-top">
                        <p className="font-medium text-white">{pool.label}</p>
                        <p className="mt-1 text-xs text-amber-100">Counted once. Do not add the divisions in this pool.</p>
                      </td>
                      {pool.current ? (
                        <SideCells side={pool.current} shortRoster={pool.currentShortRoster} includeFeeder={forecast.includeFeeder} />
                      ) : (
                        <EmptySideCells />
                      )}
                      {pool.proposed ? (
                        <SideCells side={pool.proposed} shortRoster={pool.proposedShortRoster} includeFeeder={forecast.includeFeeder} />
                      ) : (
                        <EmptySideCells />
                      )}
                      <td className="py-2 pr-3 align-top tabular-nums">
                        {pool.current && pool.proposed ? formatDelta(pool.proposed.pool - pool.current.pool) : "—"}
                      </td>
                      <td className="py-2 pr-3 align-top tabular-nums">
                        {pool.current && pool.proposed ? formatDelta(pool.proposed.expected - pool.current.expected) : "—"}
                      </td>
                      <td className="py-2 pr-3 align-top tabular-nums">
                        {pool.current && pool.proposed
                          ? formatDeltaTeams(pool.proposed.minTeams - pool.current.minTeams, pool.proposed.maxTeams - pool.current.maxTeams)
                          : "—"}
                      </td>
                      <td className="py-2 align-top text-zinc-500">—</td>
                    </tr>
                  ))}
                  {forecast.rows.map((row) => {
                    const overlap = (row.currentOverlap ?? 0) > 0 || (row.proposedOverlap ?? 0) > 0;
                    const shared = Boolean(row.currentSharedPoolId || row.proposedSharedPoolId);
                    return (
                      <tr key={row.code} className="border-t border-zinc-800 text-zinc-200">
                        <td className="py-2 pr-3 align-top">
                          <p className="font-medium text-white">
                            {row.label}
                            {editedCodes.includes(row.code) ? (
                              <span className="ml-2 inline-flex rounded-full border border-violet-400/40 bg-violet-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-100" data-testid="division-edited">
                                edited
                              </span>
                            ) : null}
                          </p>
                          {shared ? (
                            <p
                              className="mt-1 inline-flex rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-100"
                              data-testid="shared-pool-member"
                              title="This division shares a pool. League and team totals count those players once."
                            >
                              Shared pool
                            </p>
                          ) : null}
                          {overlap ? (
                            <p
                              className="mt-1 inline-flex rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200"
                              title="A player in this count is also eligible for another division."
                            >
                              Overlap
                            </p>
                          ) : null}
                        </td>
                        <SideCells side={row.current} shortRoster={row.currentShortRoster === true} includeFeeder={forecast.includeFeeder} />
                        <SideCells side={row.proposed} shortRoster={row.proposedShortRoster === true} includeFeeder={forecast.includeFeeder} />
                        <td className="py-2 pr-3 align-top tabular-nums" data-testid="delta-players">
                          {formatDelta(row.delta.pool)}
                        </td>
                        <td className="py-2 pr-3 align-top tabular-nums">{formatDelta(row.delta.expected)}</td>
                        <td className="py-2 pr-3 align-top tabular-nums">
                          {formatDeltaTeams(row.delta.minTeams, row.delta.maxTeams)}
                        </td>
                        <td
                          className="py-2 align-top tabular-nums"
                          data-testid="movers-in-out"
                          title={moverTooltip(row.moversIn, row.moversOut)}
                        >
                          +{moverCellCount(row.moversIn, forecast.includeFeeder)} / −{moverCellCount(row.moversOut, forecast.includeFeeder)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4" data-testid="where-kids-move">
              <h3 className="text-sm font-semibold text-white">Where kids move</h3>
              {moveLines.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-400">No players change divisions.</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-200">
                  {moveLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4" data-testid="eligibility-contrast">
              <h3 className="text-sm font-semibold text-white">Little League vs DYB eligibility</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Raw counts for each division&apos;s age span. Little League uses Aug 31. DYB uses Apr 30. Feeder counts
                are before the share
                {forecast.includeFeeder ? " and are included in the numbers below." : " and are hidden while feeder is off."}
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    <tr>
                      <th className="py-1 pr-3">Division</th>
                      <th className="py-1 pr-3">LL</th>
                      <th className="py-1 pr-3">DYB</th>
                      <th className="py-1 pr-3">Both</th>
                      <th className="py-1 pr-3">LL-only</th>
                      <th className="py-1 pr-3">DYB-only</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.eligibility.map((row) => (
                      <tr key={row.code} data-testid="eligibility-row">
                        <td className="py-1 pr-3 text-zinc-100">
                          {row.label}
                          <span className="mt-0.5 block text-xs text-zinc-500">
                            LL {row.llOldest}..{row.llYoungest} · DYB {row.dybOldest}..{row.dybYoungest}
                          </span>
                        </td>
                        {([row.ll, row.dyb, row.both, row.llOnly, row.dybOnly] as const).map((side, index) => (
                          <td key={index} className="py-1 pr-3 tabular-nums" title={eligibilityTooltip(side)}>
                            {eligibilityShown(side, forecast.includeFeeder)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2" data-testid="forecast-footer">
              <p data-testid="league-totals">
                League total, each player once: current {forecast.league.current.expected} expected, teams{" "}
                {formatTeamRange(forecast.league.current.minTeams, forecast.league.current.maxTeams)}; proposed{" "}
                {forecast.league.proposed.expected} expected, teams{" "}
                {formatTeamRange(forecast.league.proposed.minTeams, forecast.league.proposed.maxTeams)}. Δ players{" "}
                {formatDelta(forecast.league.delta.pool)}.
              </p>
              <p>
                Players, counted once: current {populationTotal(forecast.current.distinctTotal)}, proposed{" "}
                {populationTotal(forecast.proposed.distinctTotal)}.
              </p>
              <p>
                Too young: current {forecast.current.tooYoung.total}, proposed {forecast.proposed.tooYoung.total}.
              </p>
              <p>
                Aged out: current {forecast.current.agedOut.total}, proposed {forecast.proposed.agedOut.total}.
              </p>
              <p data-testid="between-divisions">
                Between divisions: current {betweenDivisionCount(forecast.current.unmatched, forecast.includeFeeder)}, proposed{" "}
                {betweenDivisionCount(forecast.proposed.unmatched, forecast.includeFeeder)}.
              </p>
              <p>
                Data source: {dataSourceLabel(forecast.source)}. Birthdate coverage:{" "}
                {coverageLabel(
                  forecast.coveragePct,
                  forecast.sources.own.datedPlayers,
                  forecast.sources.own.players,
                )}
                .
              </p>
              <p data-testid="carryover-reference">{carryoverReferenceLabel(org, forecast.seasonYear, forecast.carryover)}</p>
              {forecast.includeFeeder ? (
                <p>
                  Feeder pool: {forecast.sources.feeder.players} players, birthdate coverage{" "}
                  {coverageLabel(
                    forecast.sources.feeder.coveragePct,
                    forecast.sources.feeder.datedPlayers,
                    forecast.sources.feeder.players,
                  )}
                  .
                </p>
              ) : null}
              {forecast.notes.length > 0 ? (
                <ul className="sm:col-span-2 list-disc space-y-1 pl-5 text-zinc-400">
                  {forecast.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : loading ? null : (
          <p className="text-sm text-zinc-400">The forecast will appear here.</p>
        )}
      </section>
    </div>
  );
}

export default function DivisionAgesForecast({
  orgs,
  seasonYears,
  springCombined = false,
}: {
  orgs: ContentOrgId[];
  seasonYears: number[];
  /** Load both Spring leagues into one editor and save them together. */
  springCombined?: boolean;
}) {
  const initialOrg = orgs[0] ?? "gonzales";
  const [org, setOrg] = useState<ContentOrgId>(initialOrg);
  const [sourceSeason, setSourceSeason] = useState(2026);
  const [targetSeason, setTargetSeason] = useState(2027);
  const [includeFeeder, setIncludeFeeder] = useState(defaultIncludeFeeder(initialOrg));
  const [retentionText, setRetentionText] = useState(defaultRetentionText(initialOrg));
  const [retentionDirty, setRetentionDirty] = useState(false);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [retentionOverride, setRetentionOverride] = useState<number | null>(null);
  const [proposed, setProposed] = useState<ProposedConfig | null>(null);
  const [baseline, setBaseline] = useState<ProposedConfig | null>(null);
  const [linkEdges, setLinkEdges] = useState(true);
  const [unlinkedBoundaries, setUnlinkedBoundaries] = useState<ReadonlySet<string>>(EMPTY_UNLINKED);
  const draftsRef = useRef(new Map<string, ProposedConfig>());
  const [loadedSource, setLoadedSource] = useState<DivisionAgesSource | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [impactHold, setImpactHold] = useState<{
    scope: string;
    key: string;
    proposed: ProposedConfig | null;
  } | null>(null);
  const [springLeagues, setSpringLeagues] = useState<SpringLeagueTable[]>([]);
  const [springSavedNote, setSpringSavedNote] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const retentionDirtyRef = useRef(retentionDirty);
  useEffect(() => {
    retentionDirtyRef.current = retentionDirty;
  }, [retentionDirty]);
  const requestGen = useRef(0);
  const dirtySince = useRef<number | null>(null);

  const years = useMemo(
    () => forecastSeasonChoices(seasonYears, sourceSeason, targetSeason),
    [seasonYears, sourceSeason, targetSeason],
  );

  const requestBody = useMemo(
    () =>
      buildForecastRequest({
        sourceSeason,
        targetSeason,
        includeFeeder: springCombined ? false : org === "gonzales" && includeFeeder,
        retentionOverride,
        proposed,
      }),
    [sourceSeason, targetSeason, org, includeFeeder, retentionOverride, proposed, springCombined],
  );
  const draftOrg = springCombined ? "spring" : org;
  const requestKey = forecastQueryKey(draftOrg, requestBody);
  const ready = proposed != null || configError != null;
  const editedCodes = useMemo(
    () => (proposed && baseline ? editedDivisionCodes(proposed, baseline) : []),
    [proposed, baseline],
  );
  const editedSummary = proposed && baseline ? forecastEditedSummary(proposed, baseline) : "";

  function commitProposed(next: ProposedConfig | null, base: ProposedConfig | null = baseline) {
    setProposed(next);
    writeStoredDraft(draftOrg, targetSeason, next, base, draftsRef.current);
  }

  useEffect(() => {
    let cancelled = false;
    const draft = readStoredDraft(draftOrg, targetSeason, draftsRef.current);
    setProposed(draft);
    setBaseline(null);
    setConfigError(null);
    setLoadedSource(null);
    async function loadOne(): Promise<{ config: ProposedConfig; source: DivisionAgesSource }> {
      const response = await fetch(
        `/api/admin/division-ages/season?org=${encodeURIComponent(org)}&seasonYear=${targetSeason}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        cutoff?: LeagueAgeRule;
        divisions?: DivisionAgeConfig[];
        source?: DivisionAgesSource;
      } | null;
      if (!response.ok || !payload?.cutoff || !Array.isArray(payload.divisions) || !payload.source) {
        throw new Error(readError(payload, "Could not load the current division ages."));
      }
      return { config: { cutoff: payload.cutoff, divisions: payload.divisions }, source: payload.source };
    }
    async function loadCombined(): Promise<{ config: ProposedConfig; source: DivisionAgesSource; leagues: SpringLeagueTable[] }> {
      const loaded = await Promise.all(
        SPRING_LEAGUE_ORGS.map(async (league) => {
          const response = await fetch(
            `/api/admin/division-ages/season?org=${encodeURIComponent(league)}&seasonYear=${targetSeason}`,
            { cache: "no-store" },
          );
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
            cutoff?: LeagueAgeRule;
            divisions?: DivisionAgeConfig[];
            source?: DivisionAgesSource;
            undoAvailable?: boolean;
            baselineToken?: string;
          } | null;
          if (!response.ok || !payload?.cutoff || !Array.isArray(payload.divisions) || !payload.source) {
            throw new Error(readError(payload, "Could not load the current division ages."));
          }
          return {
            organizationId: league,
            cutoff: payload.cutoff,
            divisions: payload.divisions,
            source: payload.source,
            undoAvailable: payload.undoAvailable === true,
            baselineToken: typeof payload.baselineToken === "string" ? payload.baselineToken : undefined,
          };
        }),
      );
      const source = loaded.every((entry) => entry.source === "season")
        ? "season"
        : loaded.some((entry) => entry.source === "league")
          ? "league"
          : "builtin";
      return {
        config: combinedForecastConfig(loaded, targetSeason),
        source,
        leagues: loaded.map((entry) => ({
          organizationId: entry.organizationId,
          cutoff: entry.cutoff,
          divisions: entry.divisions,
          undoAvailable: entry.undoAvailable,
          baselineToken: entry.baselineToken,
        })),
      };
    }
    async function load() {
      try {
        const loaded = springCombined ? await loadCombined() : await loadOne();
        if (cancelled) return;
        const copy = cloneProposed(loaded.config);
        setLoadedSource(loaded.source);
        setSpringLeagues(springCombined ? (loaded as { leagues?: SpringLeagueTable[] }).leagues ?? [] : []);
        setBaseline(copy);
        const latest = readStoredDraft(draftOrg, targetSeason, draftsRef.current) ?? draft;
        setProposed(latest ?? cloneProposed(copy));
      } catch (caught) {
        if (!cancelled) {
          setConfigError(caught instanceof Error ? caught.message : "Could not load the current division ages.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [draftOrg, org, springCombined, targetSeason, reloadToken]);

  useEffect(() => {
    if (!ready) {
      dirtySince.current = null;
      return;
    }
    const generation = requestGen.current + 1;
    requestGen.current = generation;
    const controller = new AbortController();
    if (dirtySince.current == null) dirtySince.current = Date.now();
    const elapsed = Date.now() - dirtySince.current;
    const wait = elapsed >= FORECAST_MAX_WAIT_MS ? 0 : FORECAST_DEBOUNCE_MS;
    const handle = setTimeout(() => {
      dirtySince.current = null;
      void (async () => {
        if (requestGen.current !== generation) return;
        setLoading(true);
        try {
          const forecastUrl = springCombined
            ? "/api/admin/division-ages/forecast?org=spring"
            : `/api/admin/division-ages/forecast?org=${encodeURIComponent(org)}`;
          const response = await fetch(forecastUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          const payload: unknown = await response.json().catch(() => null);
          if (requestGen.current !== generation) return;
          if (!response.ok || !isForecastResponse(payload)) {
            setForecastError(readError(payload, "Could not load the forecast."));
            return;
          }
          setForecastError(null);
          setForecast(payload);
          setImpactHold({
            scope: `${draftOrg}|${targetSeason}`,
            key: requestKey,
            proposed: requestBody.proposed ? cloneProposed(requestBody.proposed) : null,
          });
          if (!retentionDirtyRef.current) {
            setRetentionText(
              shownRetentionPercent({
                dirty: false,
                text: "",
                applied: payload.retention.applied,
                org,
              }),
            );
          }
        } catch (error) {
          if (requestGen.current !== generation) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setForecastError("Could not load the forecast.");
        } finally {
          if (requestGen.current === generation) setLoading(false);
        }
      })();
    }, wait);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [ready, requestKey, draftOrg, org, springCombined, targetSeason, requestBody]);

  const impactScope = `${draftOrg}|${targetSeason}`;
  const impactForScope = impactHold?.scope === impactScope ? impactHold : null;

  function selectOrg(next: ContentOrgId) {
    writeStoredDraft(draftOrg, targetSeason, proposed, baseline, draftsRef.current);
    setOrg(next);
    setIncludeFeeder(defaultIncludeFeeder(next));
    setRetentionDirty(false);
    setRetentionError(null);
    setRetentionOverride(null);
    setRetentionText(defaultRetentionText(next));
    setForecast(null);
  }

  const sourceForLabel = forecast?.currentSource ?? loadedSource;
  const sourceLabel = sourceForLabel ? divisionAgesSourceLabel(sourceForLabel, forecast?.targetSeasonYear ?? targetSeason) : null;

  return (
    <DivisionAgesForecastView
      org={org}
      orgs={orgs}
      seasonYears={years}
      sourceSeason={sourceSeason}
      targetSeason={targetSeason}
      includeFeeder={includeFeeder}
      retentionText={retentionText}
      retentionDirty={retentionDirty}
      retentionError={retentionError}
      appliedRetention={retentionDirty ? null : forecast?.retention.applied ?? null}
      retentionHint={forecast ? retentionSourceLabel(forecast.retention.source) : null}
      proposed={proposed}
      baseline={baseline}
      currentSourceLabel={sourceLabel}
      forecast={forecast}
      loading={ready && loading}
      error={forecastError}
      configError={configError}
      linkEdges={linkEdges}
      editedCodes={editedCodes}
      editedSummary={editedSummary}
      impactCounted={impactForScope?.proposed ?? null}
      impactPending={ready && impactForScope?.key !== requestKey && (loading || !forecastError)}
      impactStale={ready && !loading && Boolean(forecastError) && impactForScope != null && impactForScope.key !== requestKey}
      onOrg={selectOrg}
      springCombined={springCombined}
      springLeagues={springLeagues}
      springSavedNote={springSavedNote}
      onSpringSaved={(message) => {
        const key = forecastDraftKey(draftOrg, targetSeason);
        draftsRef.current.delete(key);
        try {
          sessionStorage.removeItem(DRAFT_PREFIX + key);
        } catch {
          /* private mode or a full quota */
        }
        setSpringSavedNote(message);
        setReloadToken((token) => token + 1);
      }}
      unlinkedBoundaries={unlinkedBoundaries}
      onToggleBoundary={(edge) => setUnlinkedBoundaries((current) => toggleTouchingBoundary(current, edge.olderCodes, edge.youngerCodes))}
      onSourceSeason={(year) => {
        writeStoredDraft(draftOrg, targetSeason, proposed, baseline, draftsRef.current);
        setSpringSavedNote(null);
        setSourceSeason(year);
        setTargetSeason(year + 1);
      }}
      onTargetSeason={(year) => {
        if (year === targetSeason) return;
        writeStoredDraft(draftOrg, targetSeason, proposed, baseline, draftsRef.current);
        setSpringSavedNote(null);
        setTargetSeason(year);
      }}
      onLinkEdges={setLinkEdges}
      onIncludeFeeder={setIncludeFeeder}
      onRetentionText={(value) => {
        setRetentionDirty(true);
        setRetentionText(value);
        const parsed = parseRetentionPercent(value);
        if (!parsed.ok) {
          setRetentionError(parsed.error);
          return;
        }
        setRetentionError(null);
        setRetentionOverride(parsed.rate);
      }}
      onResetRetention={() => {
        setRetentionDirty(false);
        setRetentionError(null);
        setRetentionOverride(null);
        setRetentionText(defaultRetentionText(org));
      }}
      onCutoff={(patch) => {
        if (springCombined || !proposed) return;
        commitProposed(withProposedCutoff(proposed, patch));
      }}
      onReplace={(next) => {
        commitProposed(next);
      }}
      onDivisions={(divisions) => {
        if (!proposed) return;
        commitProposed({ ...proposed, divisions });
      }}
      onResetProposed={() => {
        if (!baseline) return;
        const edited = proposed != null && !sameProposedConfig(proposed, baseline);
        if (edited && !window.confirm("Discard the proposed cutoff changes for this season?")) return;
        commitProposed(cloneProposed(baseline), baseline);
      }}
    />
  );
}
