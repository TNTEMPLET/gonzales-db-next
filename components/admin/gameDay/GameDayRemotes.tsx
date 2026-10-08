"use client";

import { useActionState } from "react";
import Link from "next/link";

import { checkInRemoteAction, checkoutRemoteAction, type RemoteActionState } from "@/app/admin/game-day/remoteActions";
import type { GameDayRemoteGame } from "@/lib/admin/scoreboardRemotes/present";

const initial: RemoteActionState = { error: null };

const fieldClass =
  "min-h-12 w-full rounded-xl border border-neutral-400 bg-white px-3 text-base text-neutral-950";

export default function GameDayRemotes({
  games,
  parkLabel,
  emptyMessage,
  manageHref,
}: {
  games: GameDayRemoteGame[];
  parkLabel: string | null;
  emptyMessage: string | null;
  manageHref: string;
}) {
  return (
    <div className="space-y-3" data-game-day-remotes="true">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-neutral-700">
          Pick a free remote, the side, and the volunteer’s full name. Check-in is one tap.
        </p>
        <Link href={manageHref} className="shrink-0 text-sm font-semibold text-neutral-950 underline">
          Manage remotes
        </Link>
      </div>
      {games.length === 0 ? (
        <p className="rounded-2xl border border-neutral-300 bg-white px-4 py-6 text-base text-neutral-700">
          {parkLabel ? `No posted games at ${parkLabel} this week.` : "No posted games this week."}
          {emptyMessage ? ` ${emptyMessage}` : ""}
        </p>
      ) : (
        games.map((game) => <RemoteCard key={game.id} game={game} />)
      )}
    </div>
  );
}

function RemoteCard({ game }: { game: GameDayRemoteGame }) {
  return (
    <article className="rounded-2xl border border-neutral-300 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-neutral-600">
          {game.when}
          {game.isToday ? <span className="ml-2 font-semibold text-amber-800">Today</span> : null}
        </p>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: game.leaguePrimaryHex, color: game.badgeText }}
        >
          {game.leagueLabel}
        </span>
      </div>
      <h2 className="mt-2 text-lg font-bold">
        {game.awayTeam} at {game.homeTeam}
      </h2>
      <p className="mt-1 text-base text-neutral-800">
        {game.division}
        {game.fieldName ? ` · ${game.parkName} · ${game.fieldName}` : ` · ${game.parkName}`}
      </p>
      {game.mode === "legacy" ? <LegacyCheckout game={game} /> : <InventoryCheckout game={game} />}
    </article>
  );
}

function LegacyCheckout({ game }: { game: GameDayRemoteGame }) {
  const past = game.legacyCheckout;
  return (
    <div className="mt-3 space-y-2">
      <p className="rounded-xl bg-amber-50 px-3 py-3 text-sm font-medium text-amber-950">{game.legacyMessage}</p>
      {past ? (
        <p className="text-sm text-neutral-700">
          {past.status === "out" ? "Was checked out" : "Was returned"}
          {past.name ? ` with ${past.name}` : ""}
          {past.team ? ` · ${past.team}` : ""}
          {past.note ? ` · ${past.note}` : ""}
        </p>
      ) : null}
      <Holds game={game} />
    </div>
  );
}

function InventoryCheckout({ game }: { game: GameDayRemoteGame }) {
  if (game.openCheckouts.length > 0) {
    return (
      <div className="mt-3 space-y-3">
        {game.openCheckouts.map((checkout) => (
          <div key={checkout.id} className="space-y-2">
            <p className="text-base font-semibold text-neutral-950">
              {checkout.label} is out with {checkout.volunteerName}
            </p>
            <p className="text-sm text-neutral-700">{checkout.sideLabel}</p>
            <CheckInForm checkoutId={checkout.id} />
          </div>
        ))}
        <Holds game={game} />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <Holds game={game} />
      {game.availableRemotes.length === 0 ? (
        <p className="text-sm text-neutral-700">No active remotes are free.</p>
      ) : (
        <CheckoutForm game={game} />
      )}
    </div>
  );
}

function Holds({ game }: { game: GameDayRemoteGame }) {
  if (game.holds.length === 0) return null;
  return (
    <div className="space-y-2">
      {game.holds.map((hold) => (
        <p key={`${hold.label}-${hold.volunteer}-${hold.matchup}`} className="rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-950">
          {hold.label} is still out with {hold.volunteer} for {hold.when} ({hold.matchup}).
        </p>
      ))}
    </div>
  );
}

function CheckInForm({ checkoutId }: { checkoutId: string }) {
  const [state, action, pending] = useActionState(checkInRemoteAction, initial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="checkoutId" value={checkoutId} />
      {state.error ? <p className="text-sm font-medium text-red-800">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-neutral-950 px-4 text-base font-semibold text-white disabled:opacity-60"
      >
        Check in
      </button>
    </form>
  );
}

function CheckoutForm({ game }: { game: GameDayRemoteGame }) {
  const [state, action, pending] = useActionState(checkoutRemoteAction, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="gameId" value={game.id} />
      <label className="block text-sm font-semibold text-neutral-800">
        Remote
        <select name="controllerId" required className={`${fieldClass} mt-1`}>
          {game.availableRemotes.map((remote) => (
            <option key={remote.id} value={remote.id}>
              {remote.homeFieldName ? `${remote.label} · ${remote.homeFieldName}` : remote.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-neutral-800">Side</legend>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-neutral-300 px-3 text-base">
          <input type="radio" name="side" value="home" required />
          Home · {game.homeTeam}
        </label>
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-neutral-300 px-3 text-base">
          <input type="radio" name="side" value="away" required />
          Away · {game.awayTeam}
        </label>
      </fieldset>
      <label className="block text-sm font-semibold text-neutral-800">
        Volunteer
        <input
          name="volunteerName"
          required
          maxLength={80}
          pattern=".*\S\s+\S.*"
          title="Enter a first and last name."
          placeholder="First and last name"
          autoComplete="name"
          className={`${fieldClass} mt-1`}
        />
      </label>
      {state.error ? <p className="text-sm font-medium text-red-800">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-neutral-950 px-4 text-base font-semibold text-white disabled:opacity-60"
      >
        Check out
      </button>
    </form>
  );
}
