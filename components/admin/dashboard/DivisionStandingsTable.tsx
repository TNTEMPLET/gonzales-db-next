"use client";

import { useState } from "react";

import type { DivisionStandingsView } from "@/lib/admin/dashboard/seasonPulse";

export default function DivisionStandingsTable({
  divisions,
  defaultAgeGroup,
}: {
  divisions: DivisionStandingsView[];
  defaultAgeGroup: string | null;
}) {
  const [ageGroup, setAgeGroup] = useState(defaultAgeGroup);
  const selected =
    divisions.find((division) => division.ageGroup === ageGroup) ??
    divisions.find((division) => division.ageGroup === defaultAgeGroup) ??
    divisions[0];

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-white">Division record</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Saved scores only. A mark means that team has fewer scored games than the division median.
          </p>
        </div>
        {divisions.length > 1 ? (
          <label className="text-xs text-zinc-400">
            Age group
            <select
              data-admin-preview-allow="true"
              value={selected?.ageGroup ?? ""}
              onChange={(event) => setAgeGroup(event.target.value)}
              className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            >
              {divisions.map((division) => (
                <option key={division.ageGroup} value={division.ageGroup}>
                  {division.ageGroup}
                  {division.completenessPercent === null ? "" : ` · ${division.completenessPercent}% scored`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {!selected || selected.rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No scored games yet this season.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2">Team</th>
                <th className="px-2 py-2">W</th>
                <th className="px-2 py-2">L</th>
                <th className="px-2 py-2">T</th>
                <th className="px-2 py-2">G</th>
                <th className="px-2 py-2">RF</th>
                <th className="px-2 py-2">RA</th>
                <th className="px-2 py-2">RD</th>
              </tr>
            </thead>
            <tbody>
              {selected.rows.map((row) => (
                <tr key={row.team} className="border-t border-zinc-800">
                  <td className="px-2 py-2 text-white">
                    {row.team}
                    {row.behindMedian ? (
                      <span className="ml-2 text-xs text-amber-300">Behind</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">{row.wins}</td>
                  <td className="px-2 py-2">{row.losses}</td>
                  <td className="px-2 py-2">{row.ties}</td>
                  <td className="px-2 py-2">{row.games}</td>
                  <td className="px-2 py-2">{row.runsScored}</td>
                  <td className="px-2 py-2">{row.runsAllowed}</td>
                  <td className="px-2 py-2">{row.runDifferential}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
