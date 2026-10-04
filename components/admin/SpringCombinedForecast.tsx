"use client";

import { useEffect, useState } from "react";

import { SPRING_COMBINED_SAVE_HINT } from "@/lib/admin/springCombined/view";
import { isForecastResponse, type ForecastResponse } from "@/lib/ageDivisions/forecastView";

const fieldClass =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

type CombinedForecast = ForecastResponse & { duplicatePlayers?: number; springCombined?: boolean };

export default function SpringCombinedForecast({ seasonYears }: { seasonYears: number[] }) {
  const initialSource = seasonYears.includes(2026) ? 2026 : (seasonYears[0] ?? 2026);
  const [sourceSeason, setSourceSeason] = useState(initialSource);
  const [targetSeason, setTargetSeason] = useState(initialSource + 1);
  const [forecast, setForecast] = useState<CombinedForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/division-ages/forecast?org=spring", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seasonYear: sourceSeason,
            targetSeasonYear: targetSeason,
            includeFeeder: false,
          }),
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !isForecastResponse(payload)) {
          const message =
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Could not load the forecast.";
          setForecast(null);
          setError(message);
          return;
        }
        setForecast(payload as CombinedForecast);
      } catch (caught) {
        if (cancelled || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setForecast(null);
        setError("Could not load the forecast.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sourceSeason, targetSeason]);

  const duplicatePlayers =
    forecast && typeof forecast.duplicatePlayers === "number" ? forecast.duplicatePlayers : null;

  return (
    <section className="space-y-4" data-testid="spring-combined-forecast">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <p className="max-w-3xl text-sm text-zinc-300">
          One pool of Gonzales and Ascension players. Someone in both leagues is counted once. Each saved division
          uses that league&apos;s own cutoff. This view does not use the Gonzales feeder share.
        </p>
        <p className="mt-3 text-sm text-amber-100">{SPRING_COMBINED_SAVE_HINT}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-zinc-300">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Source season</span>
          <select className={fieldClass} value={sourceSeason} onChange={(event) => setSourceSeason(Number(event.target.value))}>
            {seasonYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-zinc-300">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Target season</span>
          <select className={fieldClass} value={targetSeason} onChange={(event) => setTargetSeason(Number(event.target.value))}>
            {seasonYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? <p className="text-sm text-zinc-300">Counting the combined pool…</p> : null}
      {error ? (
        <p className="text-sm text-amber-200" role="alert">
          {error}
        </p>
      ) : null}
      {forecast ? (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full min-w-[32rem] text-left text-sm" data-testid="spring-forecast-table">
            <caption className="sr-only">Combined spring forecast counts</caption>
            <thead className="bg-zinc-900/80 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Division</th>
                <th scope="col" className="px-3 py-2 font-semibold">Players in window</th>
                <th scope="col" className="px-3 py-2 font-semibold">Expected</th>
              </tr>
            </thead>
            <tbody>
              {forecast.rows.map((row) => (
                <tr key={row.code} className="border-t border-zinc-800 text-zinc-200">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 tabular-nums">{row.proposed.pool}</td>
                  <td className="px-3 py-2 tabular-nums">{row.proposed.expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-3 text-sm text-zinc-300">
            Players counted once: {forecast.proposed.distinctTotal.total}.
            {duplicatePlayers != null && duplicatePlayers > 0
              ? ` ${duplicatePlayers} in both leagues, flagged and not counted twice.`
              : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}
