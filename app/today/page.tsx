import Link from "next/link";
import { connection } from "next/server";

import TodayScheduleView from "@/components/tournaments/TodayScheduleView";
import { buildTodayScheduleForOrg } from "@/lib/tournament-brackets/todaySchedule";
import { getBracketOrgForDeployment, getSiteConfig, isTournamentOnlyDeployment } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Today's Schedule | ${site.name}`,
    description: `Today's tournament games by field for ${site.name}.`,
  };
}

export default async function TodaySchedulePage() {
  await connection();
  const site = getSiteConfig();
  const org = getBracketOrgForDeployment();
  const schedule = await buildTodayScheduleForOrg(org);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <TodayScheduleView schedule={schedule} />

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/tournaments"
            className="rounded-xl bg-brand-purple px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-purple-dark"
          >
            View Brackets
          </Link>
          {isTournamentOnlyDeployment() ? (
            <Link
              href="/rosters"
              className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-brand-gold hover:text-brand-gold"
            >
              View Rosters
            </Link>
          ) : null}
          <Link
            href="/"
            className="rounded-xl border border-zinc-800 px-5 py-3 text-sm font-semibold text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
          >
            {site.shortName} Home
          </Link>
        </div>
      </section>
    </main>
  );
}
