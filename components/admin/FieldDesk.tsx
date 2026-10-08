import type { FieldDeskGame } from "@/lib/admin/fieldDeskTypes";
import { gameUsesUmpires } from "@/lib/admin/umpirePayRows";

export default function FieldDesk({
  orgLabel,
  games,
  parkName,
  sections,
}: {
  orgLabel: string;
  games: FieldDeskGame[];
  parkName: string | null;
  /** Omit to keep the full field desk. Game Day passes the section it is showing. */
  sections?: Array<"controllers" | "where" | "cards">;
}) {
  const show = (section: "controllers" | "where" | "cards") => !sections || sections.includes(section);
  const stillOut = games.filter((game) => game.checkoutStatus === "out").length;
  const umpireGames = games.filter((game) => gameUsesUmpires(game.ageGroup));
  const today = umpireGames.filter((game) => game.isToday);
  const later = umpireGames.filter((game) => !game.isToday);

  return (
    <div className="space-y-10">
      {show("controllers") ? <section id="controllers" className="scroll-mt-24 space-y-4">
        <h2 className="text-2xl font-bold text-white">Scoreboard controllers</h2>
        <p className="max-w-3xl text-sm text-zinc-400">
          Each field has one controller. Check-out and check-in happen on Game Day. This list only shows who still has the remote.
          {stillOut > 0 ? ` ${stillOut} still out.` : ""}
        </p>
        {games.length === 0 ? (
          <p className="text-sm text-zinc-500">{emptyWeek(parkName)}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Game</th>
                  <th className="px-3 py-2">Place</th>
                  <th className="px-3 py-2">Controller</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game.id} className="border-t border-zinc-800">
                    <td className="px-3 py-3 text-zinc-300">
                      {game.when}
                      {game.isToday ? <span className="ml-2 text-xs text-amber-200">Today</span> : null}
                    </td>
                    <td className="px-3 py-3 text-white">
                      <div className="text-xs text-zinc-500">{game.ageGroup}</div>
                      {game.homeTeam} vs {game.awayTeam}
                    </td>
                    <td className="px-3 py-3 text-zinc-400">
                      {game.parkName}
                      <div className="text-xs">{game.fieldName}</div>
                    </td>
                    <td className="px-3 py-3">
                      <ControllerStatus game={game} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section> : null}

      {show("where") ? <section id="where" className="scroll-mt-24 space-y-3">
        <h2 className="text-2xl font-bold text-white">Where the umpires are calling</h2>
        <p className="max-w-3xl text-sm text-zinc-400">
          Read this to the crew. The umpire’s name is not stored here. It stays in Assignr.
        </p>
        <GameList games={today.length > 0 ? today : umpireGames} empty={emptyUmpireWeek(parkName)} />
        {today.length > 0 && later.length > 0 ? (
          <details className="text-sm text-zinc-400">
            <summary className="cursor-pointer text-zinc-200">Rest of the week</summary>
            <div className="mt-3">
              <GameList games={later} empty="" />
            </div>
          </details>
        ) : null}
      </section> : null}

      {show("cards") ? <section id="cards" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Umpire score cards</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            {orgLabel}. Copy each row onto a printed card. The cards themselves are not printed from here.
          </p>
        </div>
        {umpireGames.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Date & time</th>
                  <th className="px-3 py-2">Division</th>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Away team</th>
                  <th className="px-3 py-2">Home team</th>
                </tr>
              </thead>
              <tbody>
                {umpireGames.map((game, index) => (
                  <tr key={game.id} className="border-t border-zinc-800">
                    <td className="px-3 py-3 text-zinc-500">{index + 1}</td>
                    <td className="px-3 py-3 text-zinc-200">{game.when}</td>
                    <td className="px-3 py-3 text-white">{game.ageGroup}</td>
                    <td className="px-3 py-3 text-zinc-300">
                      {game.parkName}
                      <div className="text-xs text-zinc-500">{game.fieldName}</div>
                    </td>
                    <td className="px-3 py-3 text-white">{game.awayTeam}</td>
                    <td className="px-3 py-3 text-white">{game.homeTeam}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{emptyUmpireWeek(parkName)}</p>
        )}
      </section> : null}
    </div>
  );
}

function ControllerStatus({ game }: { game: FieldDeskGame }) {
  if (game.checkoutStatus === "out") {
    return (
      <p className="text-amber-100">
        Out with {game.checkoutName || "a volunteer"}
        <span className="mt-0.5 block text-xs text-zinc-400">
          {game.checkoutTeam} · {game.checkoutNote}
        </span>
      </p>
    );
  }

  if (game.checkoutStatus === "returned") {
    return (
      <p className="text-emerald-200">
        Returned
        <span className="mt-0.5 block text-xs text-zinc-400">
          {game.checkoutName ? `${game.checkoutName} · ` : ""}
          {game.checkoutTeam ? `${game.checkoutTeam} · ` : ""}
          {game.checkoutNote}
        </span>
      </p>
    );
  }

  if (game.controllerHold) {
    return (
      <p className="max-w-xs text-sm text-amber-100">
        Still out with {game.controllerHold.volunteer} for {game.controllerHold.when} ({game.controllerHold.matchup}). Check that game in before this one.
      </p>
    );
  }

  return <p className="text-sm text-zinc-400">In</p>;
}

function emptyWeek(parkName: string | null) {
  return parkName ? `No posted games at ${parkName} this week.` : "No posted games this week.";
}

function emptyUmpireWeek(parkName: string | null) {
  return parkName
    ? `No umpire games at ${parkName} this week.`
    : "No umpire games this week.";
}

function GameList({ games, empty }: { games: FieldDeskGame[]; empty: string }) {
  if (games.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
      {games.map((game) => (
        <li key={game.id} className="px-4 py-3 text-sm">
          <div className="text-zinc-500">{game.when} · {game.ageGroup}</div>
          <div className="text-white">{game.homeTeam} vs {game.awayTeam}</div>
          <div className="text-zinc-300">{game.parkName} · {game.fieldName}</div>
        </li>
      ))}
    </ul>
  );
}
