import Link from "next/link";

import type { TodayScheduleResult } from "@/lib/tournament-brackets/todaySchedule";
import { formatTournamentDateTime } from "@/lib/tournament-monitor/formatDateTime";

type Props = {
  schedule: TodayScheduleResult;
};

function statusClassName(statusLabel: string, isLive: boolean): string {
  if (isLive || statusLabel === "LIVE") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }
  if (statusLabel === "Final") {
    return "border-zinc-600 bg-zinc-800/80 text-zinc-300";
  }
  return "border-zinc-700 bg-zinc-900/80 text-zinc-400";
}

export default function TodayScheduleView({ schedule }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex rounded-full bg-brand-purple px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            Today&apos;s Schedule
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {schedule.dateHeading}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            All tournament games scheduled for today, grouped by field. Times are Central.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
            {schedule.totalGames} game{schedule.totalGames === 1 ? "" : "s"}
          </span>
          {schedule.liveGames > 0 ? (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-300">
              {schedule.liveGames} live
            </span>
          ) : null}
          <span className="rounded-full border border-zinc-800 px-3 py-1 text-zinc-500">
            Updated {formatTournamentDateTime(schedule.polledAt)}
          </span>
        </div>
      </div>

      {schedule.fieldGroups.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center">
          <p className="text-lg font-semibold text-white">No games scheduled for today</p>
          <p className="mt-2 text-sm text-zinc-400">
            Check back later or view the full brackets for upcoming matchups.
          </p>
          <Link
            href="/tournaments"
            className="mt-5 inline-flex rounded-xl bg-brand-purple px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-purple-dark"
          >
            View Brackets
          </Link>
        </div>
      ) : (
        <div className="grid gap-5">
          {schedule.fieldGroups.map((group) => (
            <section
              key={group.field}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-lg shadow-black/10"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/60 px-4 py-3 sm:px-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">
                    Field
                  </p>
                  <h2 className="text-xl font-bold text-white">{group.field}</h2>
                </div>
                <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                  {group.games.length} game{group.games.length === 1 ? "" : "s"}
                </span>
              </div>

              <ul className="divide-y divide-zinc-800">
                {group.games.map((game) => (
                  <li key={`${game.bracketProjectId}:${game.matchId}`}>
                    <Link
                      href={game.bracketHref}
                      className="group block px-4 py-4 transition hover:bg-zinc-950/50 sm:px-5"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-zinc-950 px-2.5 py-1 text-sm font-semibold tabular-nums text-white">
                              {game.time ?? "TBD"}
                            </span>
                            {game.gameBadge ? (
                              <span className="rounded-md border border-zinc-700 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-300">
                                {game.gameBadge}
                              </span>
                            ) : null}
                            <span className="rounded-md border border-brand-purple/30 bg-brand-purple/10 px-2 py-1 text-xs font-semibold text-brand-gold">
                              {game.divisionLabel}
                            </span>
                            <span
                              className={`rounded-md border px-2 py-1 text-xs font-semibold uppercase tracking-wide ${statusClassName(game.statusLabel, game.isLive)}`}
                            >
                              {game.isLive && game.inningLabel
                                ? `${game.statusLabel} · ${game.inningLabel}`
                                : game.statusLabel}
                            </span>
                          </div>

                          <p className="mt-3 text-lg font-semibold text-white group-hover:text-brand-gold">
                            {game.homeTeam}
                            <span className="mx-2 text-sm font-normal text-zinc-500">vs</span>
                            {game.awayTeam}
                          </p>

                          {game.scoreLabel && game.scoreLabel !== "—" ? (
                            <p className="mt-1 text-sm font-medium text-zinc-300">
                              Score {game.scoreLabel}
                            </p>
                          ) : null}
                        </div>

                        <div className="shrink-0 text-sm font-semibold text-brand-gold group-hover:text-white">
                          Open bracket →
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
