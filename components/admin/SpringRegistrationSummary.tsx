import { getOrgDisplayName } from "@/lib/siteConfig";

import type { SpringRegistrationSummary } from "@/lib/admin/springCombined/view";

export default function SpringRegistrationSummary({ summary }: { summary: SpringRegistrationSummary }) {
  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6"
      data-testid="spring-registration-summary"
      aria-labelledby="spring-registration-heading"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Registration</p>
      <h2 id="spring-registration-heading" className="mt-1 text-xl font-semibold text-white">
        Spring {summary.seasonYear} players
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-zinc-400">
        Operational enrollments for Gonzales and Ascension. Registration-history rows are left out. A player
        registered in both leagues is counted once.
      </p>
      <p className="mt-4 text-3xl font-semibold tabular-nums text-white">{summary.totalPlayers}</p>
      <p className="text-sm text-zinc-400">players across both leagues</p>
      {summary.duplicatePlayers > 0 ? (
        <p className="mt-3 text-sm text-amber-200" data-testid="spring-duplicate-flag">
          {summary.duplicatePlayers} {summary.duplicatePlayers === 1 ? "player is" : "players are"} in both leagues
          (same SportsConnect row). Counted once.
        </p>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No player is registered in both leagues.</p>
      )}
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {summary.byLeague.map((league) => (
          <div key={league.organizationId} className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {getOrgDisplayName(league.organizationId)} only
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-white">{league.players}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">Players by league and division</caption>
          <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            <tr>
              <th scope="col" className="py-2 pr-3 font-semibold">Division</th>
              <th scope="col" className="py-2 pr-3 font-semibold">League</th>
              <th scope="col" className="py-2 font-semibold">Players</th>
            </tr>
          </thead>
          <tbody>
            {summary.byDivision.length === 0 ? (
              <tr className="border-t border-zinc-800 text-zinc-400">
                <td className="py-3" colSpan={3}>
                  No operational enrollments for this spring year.
                </td>
              </tr>
            ) : (
              summary.byDivision.map((row) => (
                <tr key={`${row.organizationId}-${row.ageGroup}`} className="border-t border-zinc-800 text-zinc-200">
                  <td className="py-2 pr-3">{row.displayName}</td>
                  <td className="py-2 pr-3">{getOrgDisplayName(row.organizationId)}</td>
                  <td className="py-2 tabular-nums">{row.players}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
