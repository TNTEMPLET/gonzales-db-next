"use client";

import { useMemo, useState } from "react";

import type { AgeGroupStandings } from "@/lib/standings";

type Props = {
  standings: AgeGroupStandings[];
};

function formatPct(value: number) {
  return value.toFixed(3);
}

export default function StandingsTabs({ standings }: Props) {
  const [activeAgeGroup, setActiveAgeGroup] = useState("");

  const selectedAgeGroup = useMemo(() => {
    if (!standings.length) return "";
    if (
      activeAgeGroup &&
      standings.some((item) => item.ageGroup === activeAgeGroup)
    ) {
      return activeAgeGroup;
    }
    return standings[0]!.ageGroup;
  }, [activeAgeGroup, standings]);

  const selected = standings.find((item) => item.ageGroup === selectedAgeGroup);

  if (standings.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-6 text-zinc-400">
        No scored games yet. Standings will appear once scores are entered.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {standings.map((group) => (
          <button
            key={group.ageGroup}
            type="button"
            onClick={() => setActiveAgeGroup(group.ageGroup)}
            className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-xs font-semibold tracking-wide transition ${
              selectedAgeGroup === group.ageGroup
                ? "border-brand-gold text-brand-gold bg-brand-gold/10"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {group.ageGroup}
          </button>
        ))}
      </div>

      <div className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-900/70">
        <table className="min-w-[680px] text-sm sm:min-w-full">
          <thead className="bg-zinc-900/80 text-zinc-300">
            <tr>
              <th className="sticky left-0 bg-zinc-900/95 px-4 py-3 text-left font-semibold">Team</th>
              <th className="text-right px-4 py-3 font-semibold">W</th>
              <th className="text-right px-4 py-3 font-semibold">L</th>
              <th className="text-right px-4 py-3 font-semibold">T</th>
              <th className="text-right px-4 py-3 font-semibold">PCT</th>
              <th className="text-right px-4 py-3 font-semibold">RS</th>
              <th className="text-right px-4 py-3 font-semibold">RA</th>
              <th className="text-right px-4 py-3 font-semibold">RD</th>
            </tr>
          </thead>
          <tbody>
            {selected?.rows.map((row) => (
              <tr key={row.team} className="border-t border-zinc-800">
                <td className="sticky left-0 bg-zinc-900/95 px-4 py-3 font-medium">{row.team}</td>
                <td className="px-4 py-3 text-right">{row.wins}</td>
                <td className="px-4 py-3 text-right">{row.losses}</td>
                <td className="px-4 py-3 text-right">{row.ties}</td>
                <td className="px-4 py-3 text-right">
                  {formatPct(row.winningPercentage)}
                </td>
                <td className="px-4 py-3 text-right">{row.runsScored}</td>
                <td className="px-4 py-3 text-right">{row.runsAllowed}</td>
                <td className="px-4 py-3 text-right">{row.runDifferential}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
