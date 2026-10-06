"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  springDivisionSheetRows,
  type SpringDivisionSheetRow,
} from "@/lib/admin/springCombined/divisionSheet";
import {
  SPRING_COMBINED_SAVE_HINT,
  SPRING_LEAGUE_ORGS,
  type SpringLeagueDivisions,
} from "@/lib/admin/springCombined/view";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";

const fieldClass =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const buttonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60";

type SeasonPayload = {
  cutoff?: LeagueAgeRule;
  divisions?: DivisionAgeConfig[];
  error?: string;
};

export default function SpringCombinedDivisions({
  defaultSeasonYear,
  seasonYears,
}: {
  defaultSeasonYear: number;
  seasonYears: number[];
}) {
  const [seasonYear, setSeasonYear] = useState(defaultSeasonYear);
  const [leagues, setLeagues] = useState<SpringLeagueDivisions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const rows = useMemo(() => springDivisionSheetRows(leagues, seasonYear), [leagues, seasonYear]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const loaded = await Promise.all(
          SPRING_LEAGUE_ORGS.map(async (org) => {
            const response = await fetch(
              `/api/admin/division-ages/season?org=${encodeURIComponent(org)}&seasonYear=${seasonYear}`,
              { cache: "no-store" },
            );
            const payload = (await response.json().catch(() => null)) as SeasonPayload | null;
            if (!response.ok || !payload?.cutoff || !Array.isArray(payload.divisions)) {
              throw new Error(payload?.error || "Could not load saved division ages.");
            }
            return { organizationId: org, cutoff: payload.cutoff, divisions: payload.divisions };
          }),
        );
        if (!cancelled) setLeagues(loaded);
      } catch (caught) {
        if (!cancelled) {
          setLeagues([]);
          setError(caught instanceof Error ? caught.message : "Could not load saved division ages.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [seasonYear]);

  return (
    <section className="space-y-4" data-testid="spring-combined-divisions">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p>{SPRING_COMBINED_SAVE_HINT}. Use the Forecast tab to review and save.</p>
        <p className="mt-2 flex flex-wrap gap-3">
          <Link className="font-semibold text-white underline" href="/admin/season-setup/division-ages?org=gonzales">
            Gonzales DYB
          </Link>
          <Link className="font-semibold text-white underline" href="/admin/season-setup/division-ages?org=ascension">
            Ascension LL
          </Link>
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block w-full text-sm text-zinc-300 sm:w-40">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Season year</span>
          <select className={fieldClass} value={seasonYear} onChange={(event) => setSeasonYear(Number(event.target.value))}>
            {seasonYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={buttonClass}
          data-testid="spring-divisions-export-pdf"
          disabled={loading || exporting || rows.length === 0}
          onClick={() => {
            void exportPdf(rows, seasonYear, setExporting, setExportError);
          }}
        >
          {exporting ? "Exporting…" : "Export PDF"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Export PDF downloads this saved table: page 1 combined, page 2 Gonzales DYB, page 3 Ascension LL.
      </p>
      {error ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100" role="alert">
          {error}
        </p>
      ) : null}
      {exportError ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100" role="alert">
          {exportError}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-zinc-300">Loading saved division ages…</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">Gonzales and Ascension divisions with league-tagged names</caption>
          <thead className="bg-zinc-900/80 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Division</th>
              <th scope="col" className="px-3 py-2 font-semibold">League</th>
              <th scope="col" className="px-3 py-2 font-semibold">Ages</th>
              <th scope="col" className="px-3 py-2 font-semibold">Oldest</th>
              <th scope="col" className="px-3 py-2 font-semibold">Youngest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code} className="border-t border-zinc-800 text-zinc-200">
                <td className="px-3 py-2">{row.displayName}</td>
                <td className="px-3 py-2">{row.league}</td>
                <td className="px-3 py-2 tabular-nums">{row.ages}</td>
                <td className="px-3 py-2 tabular-nums">{row.oldest}</td>
                <td className="px-3 py-2 tabular-nums">{row.youngest}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function exportPdf(
  rows: readonly SpringDivisionSheetRow[],
  seasonYear: number,
  setExporting: (value: boolean) => void,
  setExportError: (value: string | null) => void,
) {
  if (rows.length === 0) return;
  setExporting(true);
  setExportError(null);
  try {
    const { buildSpringDivisionsPdf, downloadSpringDivisionsPdf } = await import(
      "@/lib/admin/springCombined/divisionSheetPdf"
    );
    downloadSpringDivisionsPdf(buildSpringDivisionsPdf({ seasonYear, rows }));
  } catch {
    setExportError("Could not build the PDF.");
  } finally {
    setExporting(false);
  }
}
