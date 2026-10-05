"use client";

import { memo, useMemo } from "react";

import {
  formatImpactPlayers,
  formatImpactTeams,
  formatWindowShift,
  impactFromComparison,
  type DivisionImpact,
} from "@/lib/ageDivisions/cutoffImpact";
import type { ForecastFlow, ForecastRow, SharedPool } from "@/lib/ageDivisions/forecast";
import { sameProposedConfig, type ProposedConfig } from "@/lib/ageDivisions/forecastView";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60";

type CountSnapshot = {
  rows: readonly ForecastRow[];
  flows: readonly ForecastFlow[];
  sharedPools?: readonly SharedPool[];
};

function barWidth(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "0%";
  const ratio = (count / max) * 100;
  return `${Math.min(100, Math.max(ratio, 2))}%`;
}

function DivisionImpactRow({ division, maxPlayers }: { division: DivisionImpact; maxPlayers: number }) {
  const gained = division.playerDelta > 0;
  const lost = division.playerDelta < 0;
  const accent = gained ? "border-l-emerald-400" : lost ? "border-l-rose-400" : "border-l-amber-300";
  const afterBar = gained ? "bg-emerald-400" : lost ? "bg-rose-400" : "bg-amber-300";
  const players = formatImpactPlayers(division.beforePlayers, division.afterPlayers);
  const teams = formatImpactTeams(division);
  const range = formatWindowShift(division);
  const expectedMoved = division.beforeExpected !== division.beforePlayers || division.afterExpected !== division.afterPlayers;
  return (
    <li
      className={`rounded-xl border border-zinc-800 border-l-4 ${accent} bg-zinc-950/80 p-3`}
      data-testid="cutoff-impact-division"
      data-shared={division.shared ? "true" : "false"}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-base font-semibold text-white">{division.label}</h4>
        <p className="text-base font-semibold tabular-nums text-zinc-100" data-testid="cutoff-impact-players">
          {players}
        </p>
      </div>
      <div className="mt-3 space-y-1.5" aria-hidden="true">
        <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Before</span>
          <div className="h-3 rounded-full bg-zinc-800">
            <div className="h-3 rounded-full bg-zinc-400" style={{ width: barWidth(division.beforePlayers, maxPlayers) }} />
          </div>
        </div>
        <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">After</span>
          <div className="h-3 rounded-full bg-zinc-800">
            <div className={`h-3 rounded-full ${afterBar}`} style={{ width: barWidth(division.afterPlayers, maxPlayers) }} />
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm tabular-nums text-zinc-200" data-testid="cutoff-impact-teams">
        {teams}
      </p>
      {expectedMoved ? (
        <p className="mt-1 text-sm text-zinc-400">
          Expected returning players {division.beforeExpected} → {division.afterExpected}. Team counts use that number.
        </p>
      ) : null}
      {range ? (
        <p className="mt-1 text-sm text-zinc-300" data-testid="cutoff-impact-range">
          {range}
        </p>
      ) : null}
    </li>
  );
}

export const DivisionAgesCutoffImpact = memo(function DivisionAgesCutoffImpact({
  baseline,
  proposed,
  counted,
  targetSeason,
  counts,
  pending,
  stale,
  onReset,
}: {
  /** Saved table, or the proposed table when this editing session opened. */
  baseline: ProposedConfig | null;
  /** Live edit, including a drag that has not been counted yet. */
  proposed: ProposedConfig | null;
  /** Proposed table that the current count belongs to. */
  counted: ProposedConfig | null;
  targetSeason: number;
  counts: CountSnapshot | null;
  pending: boolean;
  stale: boolean;
  onReset: () => void;
}) {
  const dirty = baseline != null && proposed != null && !sameProposedConfig(proposed, baseline);
  const impact = useMemo(() => {
    if (!baseline || !counted || !counts) return null;
    return impactFromComparison({
      baseline,
      proposed: counted,
      targetSeasonYear: targetSeason,
      rows: counts.rows,
      flows: counts.flows,
      sharedPools: counts.sharedPools ?? [],
    });
  }, [baseline, counted, counts, targetSeason]);

  if (!baseline || !proposed) return null;

  const maxPlayers = impact
    ? Math.max(1, ...impact.divisions.flatMap((division) => [division.beforePlayers, division.afterPlayers]))
    : 1;
  const status = pending
    ? "Updating the chart…"
    : stale
      ? "These numbers are from the previous cutoff. The latest count did not load."
      : null;

  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"
      data-testid="cutoff-impact"
      aria-busy={pending}
      aria-labelledby="cutoff-impact-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="cutoff-impact-heading" className="text-xl font-semibold text-white">
            What this change does
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            Compared with the table from when you opened this season. Only divisions whose players or teams change are
            listed. Overlapping divisions are one shared-pool card, counted once.
          </p>
        </div>
        {dirty ? (
          <button type="button" className={buttonClass} data-testid="cutoff-impact-reset" onClick={onReset}>
            Reset to starting table
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-base leading-relaxed text-zinc-100" data-testid="cutoff-impact-summary" aria-live="polite">
        {impact?.summary ?? (pending ? "Counting players and teams…" : "The chart appears when the count loads.")}
      </p>
      {status ? (
        <p className="mt-2 text-sm text-zinc-400" role="status" data-testid="cutoff-impact-status">
          {status}
        </p>
      ) : null}
      {impact && impact.divisions.length > 0 ? (
        <>
          <ul className="mt-4 space-y-3" aria-label="Divisions and shared pools whose player or team count changes">
            {impact.divisions.map((division) => (
              <DivisionImpactRow key={division.code} division={division} maxPlayers={maxPlayers} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            Bar length is the player count. Gray is before. Green is a gain and red is a loss. The numbers do not depend
            on those colors.
          </p>
        </>
      ) : impact ? (
        <p className="mt-3 text-sm text-zinc-400">
          Drag a boundary or change the cutoff date. The chart lists a division only when its player or team count
          would change.
        </p>
      ) : null}
    </section>
  );
});
