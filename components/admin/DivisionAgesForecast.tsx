"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  divisionAgesSourceLabel,
  seasonCutoffIso,
  setDivisionBirthdate,
  stripBirthdatesMatchingCutoff,
} from "@/lib/ageDivisions/draft";
import type { ForecastSide } from "@/lib/ageDivisions/forecast";
import {
  FORECAST_CAVEATS,
  FORECAST_DEBOUNCE_MS,
  buildForecastRequest,
  carryoverReferenceLabel,
  cloneProposed,
  coverageLabel,
  dataSourceLabel,
  defaultIncludeFeeder,
  defaultRetentionText,
  forecastQueryKey,
  forecastSeasonChoices,
  formatDelta,
  formatDeltaTeams,
  formatRetentionPercent,
  formatTeamRange,
  isForecastResponse,
  parseRetentionPercent,
  populationTotal,
  retentionSourceLabel,
  shownRetentionPercent,
  withProposedCutoff,
  type ForecastResponse,
  type ProposedConfig,
} from "@/lib/ageDivisions/forecastView";
import type { DivisionAgesSource } from "@/lib/ageDivisions/schema";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";
import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";

const fieldClass =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-white";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-60";

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
  currentSourceLabel,
  forecast,
  loading,
  error,
  configError,
  onOrg,
  onSourceSeason,
  onTargetSeason,
  onIncludeFeeder,
  onRetentionText,
  onResetRetention,
  onCutoff,
  onDivision,
  onResetProposed,
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
  currentSourceLabel: string | null;
  forecast: ForecastResponse | null;
  loading: boolean;
  error: string | null;
  configError: string | null;
  onOrg: (org: ContentOrgId) => void;
  onSourceSeason: (year: number) => void;
  onTargetSeason: (year: number) => void;
  onIncludeFeeder: (value: boolean) => void;
  onRetentionText: (value: string) => void;
  onResetRetention: () => void;
  onCutoff: (patch: Partial<LeagueAgeRule>) => void;
  onDivision: (index: number, next: DivisionAgeConfig) => void;
  onResetProposed: () => void;
}) {
  const retentionValue = shownRetentionPercent({
    dirty: retentionDirty,
    text: retentionText,
    applied: appliedRetention,
    org,
  });
  const cutoffIso = proposed ? seasonCutoffIso(proposed.cutoff, targetSeason) : "";

  return (
    <div className="space-y-6" data-testid="forecast-tab">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300" data-testid="forecast-caveats">
          {FORECAST_CAVEATS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-zinc-500">
          Proposed cutoffs stay in this browser. Save a real table from the Divisions tab. Team size comes from league
          defaults (11–12 unless Settings sets a roster size).
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orgs.length > 1 ? (
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
          {org === "gonzales" ? (
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
          {org === "gonzales" && forecast ? (
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
          <button type="button" className={buttonClass} disabled={!proposed} onClick={onResetProposed}>
            Reset proposed to current
          </button>
        </div>
        {configError ? (
          <p className="mb-3 text-sm text-amber-200" role="status">
            {configError}
          </p>
        ) : null}
        {!proposed ? <p className="text-sm text-zinc-300">Loading the current division ages…</p> : null}
        {proposed ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-zinc-300">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cutoff month</span>
                <select
                  className={fieldClass}
                  aria-label="Proposed cutoff month"
                  value={proposed.cutoff.cutoffMonth}
                  onChange={(event) => onCutoff({ cutoffMonth: Number(event.target.value) })}
                >
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-zinc-300">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cutoff day</span>
                <input
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
            <div className="space-y-3">
              {proposed.divisions.map((division, index) => (
                <div key={`${division.code}-${index}`} className="rounded-xl border border-zinc-800 p-3">
                  <p className="text-sm font-semibold text-white">
                    {division.label} <span className="font-normal text-zinc-500">{division.code}</span>
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-sm text-zinc-300">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Min age</span>
                      <input
                        className={fieldClass}
                        aria-label={`Proposed minimum age ${index + 1}`}
                        inputMode="numeric"
                        value={division.minAge}
                        onChange={(event) =>
                          onDivision(
                            index,
                            stripBirthdatesMatchingCutoff(
                              { ...division, minAge: Number(event.target.value) },
                              cutoffIso,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="text-sm text-zinc-300">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Max age</span>
                      <input
                        className={fieldClass}
                        aria-label={`Proposed maximum age ${index + 1}`}
                        inputMode="numeric"
                        value={division.maxAge}
                        onChange={(event) =>
                          onDivision(
                            index,
                            stripBirthdatesMatchingCutoff(
                              { ...division, maxAge: Number(event.target.value) },
                              cutoffIso,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="text-sm text-zinc-300">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Oldest override</span>
                      <input
                        type="date"
                        className={fieldClass}
                        aria-label={`Proposed oldest birthdate ${index + 1}`}
                        value={division.oldestBirthdate ?? ""}
                        onChange={(event) =>
                          onDivision(
                            index,
                            setDivisionBirthdate(division, "oldestBirthdate", event.target.value, cutoffIso),
                          )
                        }
                      />
                    </label>
                    <label className="text-sm text-zinc-300">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Youngest override</span>
                      <input
                        type="date"
                        className={fieldClass}
                        aria-label={`Proposed youngest birthdate ${index + 1}`}
                        value={division.youngestBirthdate ?? ""}
                        onChange={(event) =>
                          onDivision(
                            index,
                            setDivisionBirthdate(division, "youngestBirthdate", event.target.value, cutoffIso),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem] text-left text-sm" data-testid="forecast-table">
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
                      Δ expected
                    </th>
                    <th className="py-2 pr-3 font-semibold" rowSpan={2}>
                      Δ teams
                    </th>
                    <th className="py-2 font-semibold" rowSpan={2}>
                      Movers
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
                          <p className="font-medium text-white">{row.label}</p>
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
                        <td className="py-2 pr-3 align-top tabular-nums">{formatDelta(row.delta.expected)}</td>
                        <td className="py-2 pr-3 align-top tabular-nums">
                          {formatDeltaTeams(row.delta.minTeams, row.delta.maxTeams)}
                        </td>
                        <td className="py-2 align-top tabular-nums">{row.movers}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2" data-testid="forecast-footer">
              <p data-testid="league-totals">
                League total, each player once: current {forecast.league.current.expected} expected, teams{" "}
                {formatTeamRange(forecast.league.current.minTeams, forecast.league.current.maxTeams)}; proposed{" "}
                {forecast.league.proposed.expected} expected, teams{" "}
                {formatTeamRange(forecast.league.proposed.minTeams, forecast.league.proposed.maxTeams)}.
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
}: {
  orgs: ContentOrgId[];
  seasonYears: number[];
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
  const [loadedSource, setLoadedSource] = useState<DivisionAgesSource | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const retentionDirtyRef = useRef(retentionDirty);
  retentionDirtyRef.current = retentionDirty;
  const requestGen = useRef(0);

  const years = useMemo(
    () => forecastSeasonChoices(seasonYears, sourceSeason, targetSeason),
    [seasonYears, sourceSeason, targetSeason],
  );

  const requestBody = useMemo(
    () =>
      buildForecastRequest({
        sourceSeason,
        targetSeason,
        includeFeeder: org === "gonzales" && includeFeeder,
        retentionOverride,
        proposed,
      }),
    [sourceSeason, targetSeason, org, includeFeeder, retentionOverride, proposed],
  );
  const requestKey = forecastQueryKey(org, requestBody);
  const ready = proposed != null || configError != null;

  useEffect(() => {
    let cancelled = false;
    setProposed(null);
    setBaseline(null);
    setConfigError(null);
    setLoadedSource(null);
    async function load() {
      try {
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
        if (cancelled) return;
        if (!response.ok || !payload?.cutoff || !Array.isArray(payload.divisions) || !payload.source) {
          setConfigError(readError(payload, "Could not load the current division ages."));
          return;
        }
        const copy = cloneProposed({ cutoff: payload.cutoff, divisions: payload.divisions });
        setLoadedSource(payload.source);
        setBaseline(copy);
        setProposed(cloneProposed(copy));
      } catch {
        if (!cancelled) setConfigError("Could not load the current division ages.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [org, targetSeason]);

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    const generation = requestGen.current + 1;
    requestGen.current = generation;
    const controller = new AbortController();
    const handle = setTimeout(() => {
      void (async () => {
        if (requestGen.current !== generation) return;
        setLoading(true);
        try {
          const response = await fetch(`/api/admin/division-ages/forecast?org=${encodeURIComponent(org)}`, {
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
    }, FORECAST_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [ready, requestKey, org, requestBody]);

  function selectOrg(next: ContentOrgId) {
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
      currentSourceLabel={sourceLabel}
      forecast={forecast}
      loading={loading}
      error={forecastError}
      configError={configError}
      onOrg={selectOrg}
      onSourceSeason={(year) => {
        setSourceSeason(year);
        setTargetSeason(year + 1);
      }}
      onTargetSeason={setTargetSeason}
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
      onCutoff={(patch) => setProposed((current) => (current ? withProposedCutoff(current, patch) : current))}
      onDivision={(index, next) =>
        setProposed((current) =>
          current
            ? { ...current, divisions: current.divisions.map((division, divisionIndex) => (divisionIndex === index ? next : division)) }
            : current,
        )
      }
      onResetProposed={() => setProposed(baseline ? cloneProposed(baseline) : null)}
    />
  );
}
