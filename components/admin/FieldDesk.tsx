import { checkInScoreboard, checkOutScoreboard, undoScoreboardReturn } from "@/app/admin/field-desk/actions";
import type { FieldDeskGame } from "@/lib/admin/fieldDeskTypes";
import type { ContentOrgId } from "@/lib/siteConfig";

export default function FieldDesk({
  org,
  orgLabel,
  games,
  parkName,
}: {
  org: ContentOrgId;
  orgLabel: string;
  games: FieldDeskGame[];
  parkName: string | null;
}) {
  const stillOut = games.filter((game) => game.checkoutStatus === "out").length;
  const today = games.filter((game) => game.isToday);
  const later = games.filter((game) => !game.isToday);

  return (
    <div className="space-y-10">
      <section id="controllers" className="scroll-mt-24 space-y-4">
        <h2 className="text-2xl font-bold text-white">Scoreboard controllers</h2>
        <p className="max-w-3xl text-sm text-zinc-400">
          Each field has one controller. Enter the volunteer’s full name and check it out to their team. The next game on that field waits until it is checked back in.
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
                      <ControllerCheckout org={org} game={game} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="where" className="scroll-mt-24 space-y-3">
        <h2 className="text-2xl font-bold text-white">Where the umpires are calling</h2>
        <p className="max-w-3xl text-sm text-zinc-400">
          Read this to the crew. The umpire’s name is not stored here. It stays in Assignr.
        </p>
        <GameList games={today.length > 0 ? today : games} empty={emptyWeek(parkName)} />
        {today.length > 0 && later.length > 0 ? (
          <details className="text-sm text-zinc-400">
            <summary className="cursor-pointer text-zinc-200">Rest of the week</summary>
            <div className="mt-3">
              <GameList games={later} empty="" />
            </div>
          </details>
        ) : null}
      </section>

      <section id="cards" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Umpire score cards</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            {orgLabel}. Copy each row onto a printed card. The cards themselves are not printed from here.
          </p>
        </div>
        {games.length > 0 ? (
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
                {games.map((game, index) => (
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
          <p className="text-sm text-zinc-500">{emptyWeek(parkName)}</p>
        )}
      </section>
    </div>
  );
}

function ControllerCheckout({ org, game }: { org: ContentOrgId; game: FieldDeskGame }) {
  if (game.checkoutStatus === "out" && game.checkoutSide) {
    const other = game.checkoutSide === "home" ? "away" : "home";
    const otherTeam = other === "home" ? game.homeTeam : game.awayTeam;
    return (
      <div className="space-y-2">
        <p className="text-amber-100">
          Out with {game.checkoutName || "a volunteer"}
          <span className="mt-0.5 block text-xs text-zinc-400">
            {game.checkoutTeam} · {game.checkoutNote}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <CheckoutForm org={org} gameId={game.id} action={checkInScoreboard} label="Check in" />
          <CheckoutForm
            org={org}
            gameId={game.id}
            action={checkOutScoreboard}
            side={other}
            label={`It was ${otherTeam}`}
            quiet
          />
        </div>
      </div>
    );
  }

  if (game.checkoutStatus === "returned") {
    return (
      <div className="space-y-2">
        <p className="text-emerald-200">
          Returned
          <span className="mt-0.5 block text-xs text-zinc-400">
            {game.checkoutName ? `${game.checkoutName} · ` : ""}
            {game.checkoutTeam ? `${game.checkoutTeam} · ` : ""}
            {game.checkoutNote}
          </span>
        </p>
        <CheckoutForm org={org} gameId={game.id} action={undoScoreboardReturn} label="Undo return" quiet />
      </div>
    );
  }

  if (game.controllerHold) {
    return (
      <p className="max-w-xs text-sm text-amber-100">
        Still out with {game.controllerHold.volunteer} for {game.controllerHold.when} ({game.controllerHold.matchup}). Check that game in before this one.
      </p>
    );
  }

  return (
    <form action={checkOutScoreboard} className="flex min-w-56 flex-col items-start gap-2">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="gameId" value={game.id} />
      <input
        name="volunteerName"
        required
        maxLength={80}
        pattern=".*\S\s+\S.*"
        title="Enter a first and last name."
        placeholder="Full name"
        autoComplete="name"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-white"
      />
      <button
        type="submit"
        name="side"
        value="home"
        className="rounded-lg border border-zinc-600 px-3 py-1.5 text-left text-xs font-semibold text-white hover:border-zinc-400"
      >
        Check out · {game.homeTeam}
      </button>
      <button
        type="submit"
        name="side"
        value="away"
        className="rounded-lg border border-zinc-600 px-3 py-1.5 text-left text-xs font-semibold text-white hover:border-zinc-400"
      >
        Check out · {game.awayTeam}
      </button>
    </form>
  );
}

function CheckoutForm({
  org,
  gameId,
  action,
  side,
  label,
  quiet = false,
}: {
  org: ContentOrgId;
  gameId: string;
  action: (formData: FormData) => Promise<void>;
  side?: "home" | "away";
  label: string;
  quiet?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="gameId" value={gameId} />
      {side ? <input type="hidden" name="side" value={side} /> : null}
      <button
        type="submit"
        className={
          quiet
            ? "text-xs font-semibold text-zinc-400 underline-offset-2 hover:text-white hover:underline"
            : "rounded-lg border border-zinc-600 px-3 py-1.5 text-left text-xs font-semibold text-white hover:border-zinc-400"
        }
      >
        {label}
      </button>
    </form>
  );
}

function emptyWeek(parkName: string | null) {
  return parkName ? `No posted games at ${parkName} this week.` : "No posted games this week.";
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
