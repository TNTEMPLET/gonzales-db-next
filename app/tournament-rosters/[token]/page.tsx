import { notFound } from "next/navigation";

import RosterIntakeForm from "@/components/tournament-rosters/RosterIntakeForm";
import { findActiveRosterLinkByToken } from "@/lib/tournament-rosters/tokens";

export function generateMetadata() {
  return {
    title: "Tournament Roster Upload | AP Baseball",
    description: "Submit a District 2 tournament roster for GameChanger import.",
  };
}

export default async function TournamentRosterIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await findActiveRosterLinkByToken(token);
  if (!link) notFound();
  const latest = link.submissions[0];
  return (
    <main className="min-h-screen bg-zinc-950 px-3 py-4 text-white sm:px-4 sm:py-8">
      <section className="mx-auto max-w-4xl">
        <RosterIntakeForm
          token={token}
          teamName={link.teamName}
          ageGroup={link.ageGroup}
          latestStatus={latest?.status ?? null}
        />
      </section>
    </main>
  );
}
