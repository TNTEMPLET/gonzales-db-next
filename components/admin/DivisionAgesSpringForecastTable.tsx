"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  readSpringForecastTableOpen,
  springForecastTableModelFromForecast,
  SPRING_FORECAST_BAR_COLOR,
  SPRING_LEAGUE_SHARE_FOOTNOTE,
  writeSpringForecastTableOpen,
  type SpringForecastTableModel,
} from "@/lib/ageDivisions/springForecastTable";
import type { LeagueMix } from "@/lib/ageDivisions/forecastMix";
import type { SpringLeagueId } from "@/lib/ageDivisions/springTimeline";

const PANEL_ID = "division-ages-spring-forecast-table";

type ForecastTableSource = {
  rows: readonly {
    code: string;
    label: string;
    sortOrder: number;
    proposed: { pool: number; expected: number; minTeams: number; maxTeams: number };
    proposedLeagueMix?: LeagueMix | null;
    proposedMix?: { note: string } | null;
  }[];
  league: { proposed: { expected: number; minTeams: number; maxTeams: number } };
};

function browserForecastTableStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const springForecastTableListeners = new Set<() => void>();

function subscribeSpringForecastTable(onStoreChange: () => void) {
  springForecastTableListeners.add(onStoreChange);
  return () => {
    springForecastTableListeners.delete(onStoreChange);
  };
}

function emitSpringForecastTable() {
  for (const listener of springForecastTableListeners) listener();
}

function springForecastTableSnapshot(): boolean {
  return readSpringForecastTableOpen(browserForecastTableStorage());
}

function springForecastTableServerSnapshot(): boolean {
  return false;
}

function ForecastChevron({ open }: { open: boolean }) {
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

function LeagueBadge({ league, label, muted }: { league: SpringLeagueId; label: string; muted: boolean }) {
  const tone =
    league === "llb"
      ? "bg-sky-400/15 text-sky-300"
      : "bg-violet-400/15 text-violet-300";
  return (
    <span
      data-testid={`league-badge-${league}`}
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone} ${muted ? "opacity-60" : ""}`}
    >
      {label}
    </span>
  );
}

function ExpectedBar({ league, percent, muted }: { league: SpringLeagueId; percent: number; muted: boolean }) {
  return (
    <span
      className="relative block h-1 w-full overflow-hidden rounded-full bg-zinc-700/40"
      data-testid="expected-bar-track"
      aria-hidden="true"
    >
      <span
        data-testid="expected-bar"
        data-bar-percent={String(percent)}
        data-muted={muted ? "true" : "false"}
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${percent}%`,
          backgroundColor: muted ? "transparent" : SPRING_FORECAST_BAR_COLOR[league],
        }}
      />
    </span>
  );
}

export function SpringForecastDivisionsPanel({
  model,
  open,
  springCombined,
  onToggle,
}: {
  model: SpringForecastTableModel;
  open: boolean;
  springCombined: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60" data-testid="spring-forecast-table-section">
      <div className="rounded-2xl">
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-4 py-3 text-left hover:bg-zinc-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-400 sm:px-6"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          data-testid="spring-forecast-table-toggle"
          onClick={onToggle}
        >
          <span className="text-sm font-semibold text-white">Divisions</span>
          {open ? (
            <span className="min-w-0 flex-1" />
          ) : (
            <span
              className="min-w-0 flex-1 truncate text-sm font-normal text-zinc-400"
              data-testid="spring-forecast-table-summary"
            >
              {model.summary}
            </span>
          )}
          <ForecastChevron open={open} />
        </button>
        <div
          id={PANEL_ID}
          hidden={!open}
          className={open ? "border-t border-zinc-800 px-4 pb-4 pt-3 sm:px-6" : undefined}
        >
          {springCombined ? (
            <div
              className="mb-3 flex flex-wrap items-center gap-4 text-xs text-zinc-400"
              data-testid="spring-forecast-legend"
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: SPRING_FORECAST_BAR_COLOR.dyb }}
                  aria-hidden="true"
                />
                DYB (Gonzales)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ backgroundColor: SPRING_FORECAST_BAR_COLOR.llb }}
                  aria-hidden="true"
                />
                LLB (Ascension)
              </span>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm" data-testid="spring-forecast-divisions">
              <caption className="sr-only">Spring forecast divisions. Counts only.</caption>
              <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    League
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Division
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    In window
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    Expected
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Teams
                  </th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row) => (
                  <tr
                    key={row.code}
                    data-testid="spring-forecast-row"
                    data-code={row.code}
                    data-muted={row.muted ? "true" : "false"}
                    className={`border-t border-zinc-800/80 ${row.muted ? "text-zinc-500" : "text-zinc-100"}`}
                  >
                    <td className="py-2.5 pr-3 align-middle">
                      <LeagueBadge league={row.league} label={row.leagueLabel} muted={row.muted} />
                    </td>
                    <td className="py-2.5 pr-3 align-middle">
                      <p className={row.muted ? "font-medium text-zinc-500" : "font-medium text-white"}>{row.label}</p>
                      {row.notes.map((note) => (
                        <p
                          key={note}
                          className="mt-0.5 text-xs leading-4 text-zinc-500"
                          data-testid="spring-forecast-row-note"
                        >
                          {note}
                        </p>
                      ))}
                    </td>
                    <td className="py-2.5 pr-3 text-right align-middle tabular-nums">{row.inWindowLabel}</td>
                    <td className="py-2.5 pr-3 align-middle">
                      <div className="flex items-center justify-end gap-3">
                        <span className="w-28 shrink-0">
                          <ExpectedBar league={row.league} percent={row.barPercent} muted={row.muted} />
                        </span>
                        <span className="w-14 text-right tabular-nums" data-testid="expected-value">
                          {row.expectedLabel}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right align-middle tabular-nums">{row.teamsLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {open && springCombined ? (
            <p className="mt-3 max-w-3xl text-xs leading-5 text-zinc-500" data-testid="spring-forecast-league-footnote">
              {SPRING_LEAGUE_SHARE_FOOTNOTE}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function DivisionAgesSpringForecastTable({
  forecast,
  springCombined,
  leagueFallback,
}: {
  forecast: ForecastTableSource;
  springCombined: boolean;
  leagueFallback: SpringLeagueId | null;
}) {
  const open = useSyncExternalStore(
    subscribeSpringForecastTable,
    springForecastTableSnapshot,
    springForecastTableServerSnapshot,
  );
  const model = useMemo(
    () => springForecastTableModelFromForecast(forecast, { springCombined, leagueFallback }),
    [forecast, springCombined, leagueFallback],
  );

  function toggle() {
    writeSpringForecastTableOpen(browserForecastTableStorage(), !open);
    emitSpringForecastTable();
  }

  return (
    <SpringForecastDivisionsPanel
      model={model}
      open={open}
      springCombined={springCombined}
      onToggle={toggle}
    />
  );
}
