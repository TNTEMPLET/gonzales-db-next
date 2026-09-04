"use client";

import { useEffect, useMemo } from "react";

import {
  buildDivisionCapacitySummary,
  buildFieldCapacityHeatmap,
  heatmapCellKey,
  heatmapCellLabel,
  type HeatmapGame,
  type HeatmapPark,
} from "@/lib/admin/fieldCapacityHeatmap";
import { sortTeamsManagementAgeGroups } from "@/lib/admin/teamsImportHelpers";

function formatClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${((hours + 11) % 12) + 1}:${minutes} ${suffix}`;
}

function formatDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export default function FieldCapacityHeatmapModal({
  parks,
  gamesStartsOn,
  gamesEndsOn,
  games,
  teamCounts,
  gamesPerTeam,
  sourceLabel,
  onClose,
}: {
  parks: HeatmapPark[];
  gamesStartsOn: string;
  gamesEndsOn: string;
  games: HeatmapGame[];
  teamCounts: Record<string, number>;
  gamesPerTeam: number;
  sourceLabel: string;
  onClose: () => void;
}) {
  const grid = useMemo(
    () => buildFieldCapacityHeatmap({ parks, gamesStartsOn, gamesEndsOn, games }),
    [parks, gamesStartsOn, gamesEndsOn, games],
  );
  const divisionRows = useMemo(
    () =>
      buildDivisionCapacitySummary({ grid, games, teamCounts, gamesPerTeam }).sort((a, b) =>
        sortTeamsManagementAgeGroups(a.division, b.division),
      ),
    [games, gamesPerTeam, grid, teamCounts],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const multiPark = new Set(grid.columns.map((column) => column.parkLabel)).size > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-heatmap-title"
        className="flex h-[88vh] w-[72vw] max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Capacity</p>
            <h3 id="field-heatmap-title" className="mt-1 text-lg font-semibold text-white">
              Field heatmap
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              {sourceLabel}. Red is booked, green is open, dark is not on the weekly board.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-red-400"
          >
            Close
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2 text-xs sm:px-5">
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-600" /> Fully booked
          </span>
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-600" /> Slots available
          </span>
          <span className="ml-auto font-semibold tabular-nums text-emerald-200">Available {grid.open}</span>
          <span className="font-semibold tabular-nums text-red-200">Booked {grid.booked}</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {!grid.rows.length ? (
            <p className="p-6 text-sm text-zinc-500">Save the weekly field board and season dates first.</p>
          ) : (
            <table className="w-full table-fixed border-collapse text-left text-[11px]" style={{ borderCollapse: "collapse" }}>
              <colgroup>
                <col className="w-24" />
                <col className="w-16" />
                {grid.columns.map((column) => (
                  <col key={column.fieldId} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th
                    className="sticky left-0 top-0 z-30 w-24 bg-zinc-950 px-2 py-2 font-semibold uppercase tracking-wider text-zinc-500"
                    style={{ border: "1px solid rgb(161 161 170)" }}
                  >
                    Date
                  </th>
                  <th
                    className="sticky top-0 z-20 w-16 bg-zinc-950 px-2 py-2 font-semibold uppercase tracking-wider text-zinc-500"
                    style={{ border: "1px solid rgb(161 161 170)" }}
                  >
                    Time
                  </th>
                  {grid.columns.map((column) => (
                    <th
                      key={column.fieldId}
                      className="sticky top-0 z-20 bg-zinc-950 px-1 py-2 text-center font-semibold text-zinc-300"
                      style={{ border: "1px solid rgb(161 161 170)" }}
                      title={`${column.parkLabel} · ${column.label}`}
                    >
                      {multiPark ? (
                        <span className="block truncate text-[10px] font-normal text-zinc-500">{column.parkLabel}</span>
                      ) : null}
                      <span className="block truncate">{column.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={`${row.date}|${row.startTime}`}>
                    <td
                      className="sticky left-0 z-10 w-24 whitespace-nowrap bg-zinc-950 px-2 py-1 font-medium text-zinc-200"
                      style={{ border: "1px solid rgb(161 161 170)" }}
                    >
                      {formatDate(row.date)}
                      <span className="ml-1 text-zinc-500">{row.dayLabel}</span>
                    </td>
                    <td
                      className="w-16 whitespace-nowrap bg-zinc-950 px-2 py-1 text-zinc-400"
                      style={{ border: "1px solid rgb(161 161 170)" }}
                    >
                      {formatClock(row.startTime)}
                    </td>
                    {grid.columns.map((column) => {
                      const cell = grid.cells[heatmapCellKey(row.date, row.startTime, column.fieldId)];
                      const status = cell?.status ?? "dark";
                      return (
                        <td
                          key={column.fieldId}
                          title={cell ? heatmapCellLabel(cell) : "Dark"}
                          style={{ border: "1px solid rgb(161 161 170)" }}
                          className={`h-7 ${
                            status === "booked"
                              ? "bg-red-600"
                              : status === "open"
                                ? "bg-emerald-600"
                                : "bg-zinc-900"
                          }`}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="max-h-56 shrink-0 overflow-auto border-t border-zinc-800">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="sticky top-0 bg-zinc-950 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Division</th>
                <th className="px-3 py-2 font-semibold">Teams</th>
                <th className="px-3 py-2 font-semibold">Games</th>
                <th className="px-3 py-2 font-semibold">Slotted</th>
                <th className="px-3 py-2 font-semibold">Need</th>
                <th className="px-3 py-2 font-semibold">Board nights</th>
              </tr>
            </thead>
            <tbody>
              {divisionRows.map((row) => (
                <tr key={row.division} className="border-t border-zinc-800">
                  <td className="px-3 py-1.5 font-semibold text-white">{row.division}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.teams}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.games}</td>
                  <td className="px-3 py-1.5 tabular-nums text-emerald-200">{row.slotted}</td>
                  <td className={`px-3 py-1.5 tabular-nums ${row.needed ? "text-red-200" : "text-zinc-400"}`}>
                    {row.needed}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{row.boardSlots}</td>
                </tr>
              ))}
              {divisionRows.length ? (
                <tr className="border-t border-zinc-700 bg-zinc-900/80 font-semibold text-white">
                  <td className="px-3 py-1.5">All</td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {divisionRows.reduce((n, row) => n + row.teams, 0)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {divisionRows.reduce((n, row) => n + row.games, 0)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-emerald-200">
                    {divisionRows.reduce((n, row) => n + row.slotted, 0)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-red-200">
                    {divisionRows.reduce((n, row) => n + row.needed, 0)}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">
                    {grid.open + grid.booked}
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-zinc-500">
                    No division counts yet. Save Parks and set teams on Generate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-zinc-500">
            Games is the draft (or the season target if you have not generated). Need is still unplaced.
            Board nights is how many field-times that division can use; a shared 7U/8U night counts for both.
          </p>
        </div>
      </div>
    </div>
  );
}
