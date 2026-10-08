import Link from "next/link";

import FieldDesk from "@/components/admin/FieldDesk";
import CopyCardsButton from "@/components/admin/gameDay/CopyCardsButton";
import GameDayScorePads from "@/components/admin/gameDay/GameDayScorePads";
import PrintCardsButton from "@/components/admin/gameDay/PrintCardsButton";
import { umpireCardText } from "@/lib/admin/gameDay/display";
import { gameDayHref, type GameDayTab } from "@/lib/admin/gameDay/tabs";
import type { GameDayListGame, GameDayPageData } from "@/lib/admin/gameDay/types";
import { getOrgDisplayName } from "@/lib/siteConfig";

const TABS: { id: GameDayTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "cards", label: "Cards" },
  { id: "controllers", label: "Remote" },
  { id: "scores", label: "Scores" },
  { id: "pay", label: "Pay" },
];

export default function GameDayView({ data }: { data: GameDayPageData }) {
  const href = (tab: GameDayTab, parkId?: string | null) =>
    gameDayHref({
      org: data.org,
      day: data.day,
      tab,
      parkId: parkId === undefined ? data.selectedParkId : parkId,
    });

  return (
    <main className="min-h-screen bg-neutral-100 pb-24 text-neutral-950 print:bg-white print:pb-0">
      <style>{`@media print { header, footer, nav { display: none !important; } }`}</style>
      <section className="mx-auto max-w-lg px-4 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Game Day</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{data.dayLabel}</h1>
        {data.selectedParkLabel ? <p className="mt-1 text-lg text-neutral-800">{data.selectedParkLabel}</p> : null}

        {data.parks.length > 1 ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1" data-game-day-parks="true">
            {data.parks.map((park) => {
              const active = park.id === data.selectedParkId;
              return (
                <Link
                  key={park.id}
                  href={href(data.tab, park.id)}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex min-h-12 shrink-0 items-center rounded-full px-4 text-base font-semibold ${
                    active ? "bg-neutral-950 text-white" : "border border-neutral-400 bg-white text-neutral-950"
                  }`}
                >
                  {park.label}
                </Link>
              );
            })}
          </div>
        ) : null}

        {data.rainoutLines.length > 0 ? (
          <div className="mt-4 space-y-2" data-game-day-rainout="readonly">
            {data.rainoutLines.map((line) => (
              <p key={line} className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-3 text-sm font-medium text-sky-950">
                {line}
              </p>
            ))}
          </div>
        ) : null}

        <div className="mt-5">
          {data.needsParkChoice ? (
            <p className="rounded-2xl border border-neutral-300 bg-white px-4 py-6 text-base text-neutral-800">
              Choose the park you are working at.
            </p>
          ) : (
            <TabPanel data={data} />
          )}
        </div>
      </section>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-300 bg-white pb-[env(safe-area-inset-bottom)]"
        aria-label="Game Day"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {TABS.map((tab) => {
            const active = data.tab === tab.id;
            return (
              <Link
                key={tab.id}
                href={href(tab.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 items-center justify-center px-1 text-center text-sm font-semibold ${
                  active ? "text-neutral-950" : "text-neutral-500"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

function TabPanel({ data }: { data: GameDayPageData }) {
  if (data.tab === "cards") return <Cards data={data} />;
  if (data.tab === "controllers") return <Controllers data={data} />;
  if (data.tab === "scores") return <Scores data={data} />;
  if (data.tab === "pay") return <Pay data={data} />;
  return <Today data={data} />;
}

function Today({ data }: { data: GameDayPageData }) {
  return (
    <div className="space-y-3">
      {data.todayGames.length === 0 ? (
        <Empty>
          {data.selectedParkLabel
            ? `No posted games at ${data.selectedParkLabel} today.`
            : "No posted games today."}
        </Empty>
      ) : (
        data.todayGames.map((game) => <GameRow key={game.id} game={game} />)
      )}
      {data.directorOnly ? (
        <p className="pt-2 text-sm text-neutral-600">
          <Link href={data.seasonSetupHref} className="font-semibold text-neutral-950 underline">
            Season setup
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Cards({ data }: { data: GameDayPageData }) {
  const text = umpireCardText(data.cardGames);
  return (
    <div className="space-y-3" data-game-day-cards="true">
      {data.crewUnavailable ? (
        <p className="text-sm text-neutral-600">Umpire names are unavailable right now. The games are still listed.</p>
      ) : null}
      {data.cardGames.length > 0 ? (
        <div className="flex gap-2 print:hidden">
          <CopyCardsButton text={text} />
          <PrintCardsButton />
        </div>
      ) : null}
      {data.cardGames.length === 0 ? (
        <Empty>
          {data.selectedParkLabel
            ? `No posted games at ${data.selectedParkLabel} today.`
            : "No posted games today."}
        </Empty>
      ) : (
        data.cardGames.map((game, index) => (
          <article key={game.id} className="rounded-2xl border border-neutral-300 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-neutral-500">{index + 1}</p>
              <LeagueBadge label={game.leagueLabel} background={game.leaguePrimaryHex} color={game.badgeText} />
            </div>
            <h2 className="mt-2 text-lg font-bold">
              {game.awayTeam} at {game.homeTeam}
            </h2>
            <p className="mt-1 text-base text-neutral-800">{game.when}</p>
            <p className="text-base text-neutral-800">{game.division}</p>
            <p className="text-base text-neutral-800">
              {game.fieldName ? `${game.parkName} · ${game.fieldName}` : game.parkName}
            </p>
            <p className="mt-2 text-base text-neutral-950">
              {game.crew.length > 0 ? game.crew.join(", ") : "Crew not listed"}
            </p>
          </article>
        ))
      )}
    </div>
  );
}

function Controllers({ data }: { data: GameDayPageData }) {
  return (
    <div className="rounded-2xl bg-neutral-950 p-3 text-white">
      <FieldDesk
        org={data.org}
        orgLabel={getOrgDisplayName(data.org)}
        games={data.controllerGames}
        parkName={data.selectedParkLabel}
        sections={["controllers"]}
      />
    </div>
  );
}

function Scores({ data }: { data: GameDayPageData }) {
  if (data.scoresClosedForPark) {
    return <Empty>Scores are not entered for this park.</Empty>;
  }
  if (data.scoreGames.length === 0) {
    return <Empty>No games past first pitch yet.</Empty>;
  }
  return <GameDayScorePads games={data.scoreGames} />;
}

function Pay({ data }: { data: GameDayPageData }) {
  const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">What is owed today. This does not mark anyone paid.</p>
      {data.payError ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">{data.payError}</p> : null}
      {data.payRows.length === 0 ? (
        <Empty>{data.payError ? "No pay total until Assignr answers." : "No umpire pay is owed at this park today."}</Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-300 bg-white">
          <ul className="divide-y divide-neutral-200">
            {data.payRows.map((row) => (
              <li key={row.umpireId} className="flex items-center justify-between gap-3 px-4 py-4">
                <div>
                  <p className="text-base font-semibold">{row.name}</p>
                  <p className="text-sm text-neutral-600">
                    {row.games} game{row.games === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="text-lg font-bold tabular-nums">{money(row.totalPay)}</p>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-neutral-300 bg-neutral-50 px-4 py-4">
            <p className="text-base font-semibold">Total</p>
            <p className="text-xl font-bold tabular-nums">{money(data.payTotal)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function GameRow({ game }: { game: GameDayListGame }) {
  return (
    <article className="rounded-2xl border border-neutral-300 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-neutral-600">{game.when}</p>
        <LeagueBadge label={game.leagueLabel} background={game.leaguePrimaryHex} color={game.badgeText} />
      </div>
      <h2 className="mt-2 text-lg font-bold">
        {game.awayTeam} at {game.homeTeam}
      </h2>
      <p className="mt-1 text-base text-neutral-800">
        {game.division}
        {game.place ? ` · ${game.place}` : ""}
      </p>
      {game.rainedOut ? <p className="mt-2 text-sm font-semibold text-sky-900">Rained out</p> : null}
    </article>
  );
}

function LeagueBadge({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: background, color }}
    >
      {label}
    </span>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="rounded-2xl border border-neutral-300 bg-white px-4 py-6 text-base text-neutral-700">{children}</p>;
}
