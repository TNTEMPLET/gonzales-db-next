"use client";

import { useState, useTransition } from "react";

import { clearGameDayRainout, setGameDayRainout } from "@/app/admin/game-day/actions";
import type { GameDayStatus } from "@/lib/admin/dashboard/gameDay";

export default function GameDayPanel({ status }: { status: GameDayStatus }) {
  const [allParksOut, setAllParksOut] = useState(status.allParksOut);
  const [parks, setParks] = useState<string[]>(status.rainedOutParks);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const active = status.allParksOut || status.rainedOutParks.length > 0;

  function togglePark(name: string) {
    setParks((current) =>
      current.includes(name) ? current.filter((park) => park !== name) : [...current, name],
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setGameDayRainout({
        organizationId: status.organizationId,
        allParksOut,
        parks,
      });
      if (!result.ok) setError(result.error);
    });
  }

  function clear() {
    setError(null);
    startTransition(async () => {
      const result = await clearGameDayRainout(status.organizationId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5" data-game-day={status.organizationId}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h3 className="text-base font-bold text-white">Game day</h3>
        <p className="text-sm text-zinc-400">
          {active
            ? status.allParksOut
              ? `All parks are rained out. ${status.throughLabel ?? ""}`.trim()
              : `${status.rainedOutParks.join(", ")} rained out. ${status.throughLabel ?? ""}`.trim()
            : "No rainout is up."}
        </p>
      </div>
      <p className="mt-2 text-sm text-zinc-500">
        Families see this on the schedule until the end of today. Games stay on the card.
        {status.organizationLabel ? ` ${status.organizationLabel}.` : ""}
      </p>

      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            checked={allParksOut}
            onChange={(event) => setAllParksOut(event.target.checked)}
            className="accent-red-500"
          />
          All parks
        </label>
        {status.parks.length === 0 ? (
          <p className="text-sm text-zinc-500">No parks are on file for this league.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {status.parks.map((park) => (
              <li key={park.name}>
                <label className={`flex items-center gap-2 text-sm ${allParksOut ? "text-zinc-500" : "text-zinc-200"}`}>
                  <input
                    type="checkbox"
                    checked={!allParksOut && parks.includes(park.name)}
                    disabled={allParksOut}
                    onChange={() => togglePark(park.name)}
                    className="accent-red-500"
                  />
                  <span>
                    {park.name}
                    <span className="ml-2 text-xs text-zinc-500">
                      {park.gamesToday === 0
                        ? "No games today"
                        : `${park.gamesToday} game${park.gamesToday === 1 ? "" : "s"} today`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || (!allParksOut && parks.length === 0)}
          className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Rain out"}
        </button>
        {active ? (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>
    </section>
  );
}
