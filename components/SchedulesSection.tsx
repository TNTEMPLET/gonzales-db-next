// components/SchedulesSection.tsx
import { Suspense } from "react";
import { fetchGames, type Game } from "@/lib/fetchGames";

async function GamesContent({
  startDate,
  endDate,
  leagueId,
}: {
  startDate: string;
  endDate: string;
  leagueId?: string;
}) {
  let games: Game[] = [];
  let error: string | null = null;

  try {
    // Fetch games from the server helper (handles token retrieval internally)
    games = await fetchGames({
      startDate,
      endDate,
      leagueId,
    });
  } catch (err: unknown) {
    console.error("Schedules error:", err);
    error =
      err instanceof Error ? err.message : "Failed to load game schedules";
  }

  if (error) {
    return (
      <div className="bg-red-950 border border-red-800 rounded-2xl p-10 text-center">
        <p className="text-red-400 mb-3">
          ⚠️ Unable to load schedules right now
        </p>
        <p className="text-sm text-zinc-400">{error}</p>
        <p className="mt-4 text-xs">
          Check your environment variables and Assignr credentials.
        </p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-12 text-center text-zinc-400">
        No games found in the selected date range.
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      {/* Games Schedule */}
      <div className="bg-zinc-900 rounded-2xl p-8">
        <h3 className="font-semibold text-2xl mb-6 flex items-center gap-3">
          📅 Upcoming & Recent Games
        </h3>
        <div className="space-y-4 max-h-[620px] overflow-auto pr-2 custom-scroll">
          {games.map((game) => {
            const gameDate = game.start_time
              ? new Date(game.start_time).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : game.localized_date
                ? `${game.localized_date} ${game.localized_time || ""}`.trim()
                : "Date TBD";

            return (
              <div
                key={game.id}
                className="bg-zinc-800 p-6 rounded-xl hover:bg-zinc-700 transition-all border border-zinc-700"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-medium text-lg">
                      {game.home_team || "Home Team"}
                      <span className="text-zinc-500 mx-2">vs</span>
                      {game.away_team || "Away Team"}
                    </p>
                    <p className="text-sm text-zinc-400 mt-1">{gameDate}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 bg-orange-600/20 text-orange-400 text-xs font-medium rounded-full">
                      {game.status || "Scheduled"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Standings Placeholder */}
      <div className="bg-zinc-900 rounded-2xl p-8">
        <h3 className="font-semibold text-2xl mb-6 flex items-center gap-3">
          🏆 Current Standings
        </h3>
        <p className="text-zinc-400">
          Standings will be added here once we have access to that endpoint (or
          we can derive basic standings from game results).
        </p>
      </div>
    </div>
  );
}

export default function SchedulesSection({
  startDate,
  endDate,
  leagueId,
}: {
  startDate: string;
  endDate: string;
  leagueId?: string;
}) {
  return (
    <section
      id="schedule"
      className="py-20 bg-zinc-950 border-t border-zinc-800"
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Schedules & Standings
          </h2>
          <p className="text-zinc-400 text-lg">
            Spring 2026 Season • Gonzales Diamond Baseball
          </p>
        </div>

        <Suspense
          fallback={
            <div className="bg-zinc-900 rounded-2xl p-20 text-center">
              <div className="animate-pulse">
                Loading schedules from Assignr...
              </div>
            </div>
          }
        >
          <GamesContent
            startDate={startDate}
            endDate={endDate}
            leagueId={leagueId}
          />
        </Suspense>

        <div className="mt-10 text-center text-xs text-zinc-500">
          Data automatically refreshes every 5 minutes • Securely powered by
          Next.js
        </div>
      </div>
    </section>
  );
}
