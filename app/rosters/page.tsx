import Link from "next/link";
import { connection } from "next/server";

import prisma from "@/lib/prisma";
import { getBracketOrgForDeployment, getSiteConfig } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

const ROSTER_SEASON_YEAR = 2026;
const DIVISION_ORDER = [
  "12U Majors",
  "11U",
  "10U",
  "9U",
  "Coaches Pitch",
  "Tee Ball",
] as const;
const ORDERED_DIVISIONS = new Set<string>(DIVISION_ORDER);

type DivisionName = (typeof DIVISION_ORDER)[number] | "Other";

type TeamRoster = {
  teamName: string;
  approvedAtLabel: string;
  players: Array<{
    id: string;
    firstName: string;
    lastName: string;
    jerseyNumber: string;
  }>;
};

type DivisionRoster = {
  division: DivisionName;
  note: string;
  teams: TeamRoster[];
};

function divisionSlug(division: string) {
  return division.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function displayPlayerName(player: { firstName: string; lastName: string }) {
  return [player.firstName, player.lastName].filter(Boolean).join(" ");
}

function resolveDivision(ageGroup: string | null, teamName: string): DivisionName {
  const text = `${ageGroup ?? ""} ${teamName}`.toLowerCase();
  if (/\b12u\b|major/.test(text)) return "12U Majors";
  if (/\b11u\b/.test(text)) return "11U";
  if (/\b10u\b|minor|aaa/.test(text)) return "10U";
  if (/\b9u\b/.test(text)) return "9U";
  if (/coach/.test(text)) return "Coaches Pitch";
  if (/tee|t-ball|tball/.test(text)) return "Tee Ball";
  return "Other";
}

function emptyDivisionRoster(division: DivisionName): DivisionRoster {
  return {
    division,
    note: "Approved player rosters will be posted here.",
    teams: [],
  };
}

async function getDivisionRosters(): Promise<DivisionRoster[]> {
  const org = getBracketOrgForDeployment();
  const links = await prisma.tournamentRosterIntakeLink.findMany({
    where: {
      organizationId: org,
      seasonYear: ROSTER_SEASON_YEAR,
    },
    orderBy: [{ teamName: "asc" }],
    select: {
      teamName: true,
      ageGroup: true,
      submissions: {
        where: { status: "APPROVED" },
        orderBy: [{ reviewedAt: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          reviewedAt: true,
          updatedAt: true,
          players: {
            orderBy: { rowNumber: "asc" },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              jerseyNumber: true,
            },
          },
        },
      },
    },
  });

  const byDivision = new Map<DivisionName, DivisionRoster>();
  for (const division of DIVISION_ORDER) byDivision.set(division, emptyDivisionRoster(division));

  for (const link of links) {
    const submission = link.submissions[0];
    if (!submission) continue;

    const division = resolveDivision(link.ageGroup, link.teamName);
    if (!byDivision.has(division)) byDivision.set(division, emptyDivisionRoster(division));
    const divisionRoster = byDivision.get(division);
    if (!divisionRoster) continue;

    divisionRoster.teams.push({
      teamName: link.teamName,
      approvedAtLabel: (submission.reviewedAt ?? submission.updatedAt).toLocaleDateString("en-US"),
      players: submission.players,
    });
  }

  for (const division of byDivision.values()) {
    division.teams.sort((left, right) => left.teamName.localeCompare(right.teamName));
  }

  return [
    ...DIVISION_ORDER.map((division) => byDivision.get(division)!),
    ...Array.from(byDivision.values()).filter((division) => !ORDERED_DIVISIONS.has(division.division)),
  ];
}

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Rosters | ${site.name}`,
    description: `Tournament rosters for ${site.name}, grouped by division.`,
  };
}

export default async function RostersPage() {
  await connection();
  const site = getSiteConfig();
  const divisionRosters = await getDivisionRosters();

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
              Approved tournament rosters for {site.shortName}. Divisions are grouped oldest to youngest.
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
          {divisionRosters.map((division) => (
            <section
              key={division.division}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/75 p-5 sm:p-6"
              aria-labelledby={`division-${divisionSlug(division.division)}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2
                  id={`division-${divisionSlug(division.division)}`}
                  className="text-xl font-semibold text-white"
                >
                  {division.division}
                </h2>
                <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                  {division.teams.length} teams posted
                </span>
              </div>

              {division.teams.length > 0 ? (
                <div className="mt-4 grid gap-4">
                  {division.teams.map((team) => (
                    <article
                      key={team.teamName}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-zinc-100">{team.teamName}</h3>
                          <p className="text-xs text-zinc-500">Approved {team.approvedAtLabel}</p>
                        </div>
                        <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                          {team.players.length} players
                        </span>
                      </div>

                      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {team.players.map((player) => (
                          <li
                            key={player.id}
                            className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-200"
                          >
                            <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-xs font-semibold text-brand-gold">
                              {player.jerseyNumber ? `#${player.jerseyNumber}` : "--"}
                            </span>
                            <span>{displayPlayerName(player)}</span>
                          </li>
                        ))}
                      </ol>
                    </article>
                  ))}
                </div>
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
