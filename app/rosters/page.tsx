import Link from "next/link";

import { getSiteConfig } from "@/lib/siteConfig";

export const dynamic = "force-static";

type DivisionRoster = {
  division: string;
  note: string;
  teams: string[];
};

const DIVISION_ROSTERS: DivisionRoster[] = [
  {
    division: "12U Majors",
    note: "Approved player rosters will be posted here.",
    teams: [],
  },
  {
    division: "11U",
    note: "Approved player rosters will be posted here.",
    teams: [],
  },
  {
    division: "10U",
    note: "Approved player rosters will be posted here.",
    teams: [],
  },
  {
    division: "9U",
    note: "Approved player rosters will be posted here.",
    teams: [],
  },
  {
    division: "Coaches Pitch",
    note: "Approved player rosters will be posted here.",
    teams: [],
  },
  {
    division: "Tee Ball",
    note: "Approved player rosters will be posted here.",
    teams: [],
  },
];

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Rosters | ${site.name}`,
    description: `Tournament rosters for ${site.name}, grouped by division.`,
  };
}

export default function RostersPage() {
  const site = getSiteConfig();

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 inline-flex rounded-full bg-brand-purple px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
              Tournament Rosters
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Rosters
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
              Public tournament roster page for {site.shortName}. Divisions are grouped oldest to youngest.
            </p>
          </div>
          <Link
            href="/tournaments"
            className="inline-flex w-fit items-center justify-center rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200 transition hover:border-brand-gold hover:text-brand-gold"
          >
            Back to Brackets
          </Link>
        </div>

        <div className="grid gap-4">
          {DIVISION_ROSTERS.map((division) => (
            <section
              key={division.division}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5 sm:p-6"
              aria-labelledby={`division-${division.division.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2
                  id={`division-${division.division.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className="text-xl font-semibold text-white"
                >
                  {division.division}
                </h2>
                <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                  {division.teams.length} teams posted
                </span>
              </div>

              {division.teams.length > 0 ? (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {division.teams.map((team) => (
                    <li
                      key={team}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-200"
                    >
                      {team}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-400">
                  {division.note}
                </p>
              )}
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
