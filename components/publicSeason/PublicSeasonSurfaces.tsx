import Link from "next/link";

import { OffSeasonNotice } from "@/components/publicSeason/OffSeasonNotice";
import {
  finalStandingsLabel,
  getSeasonLabel,
  isSpringContentOrg,
  isSpringPublicOffSeason,
  offSeasonSeasonInfoMessage,
  springPublicPhase,
  type CompletedSeasonRecord,
  type PublicRegistrationStatus,
  type PublicSeasonSurface,
  type SpringContentOrgId,
} from "@/lib/publicSeason/offSeason";

const OPERATIONAL_SURFACES = new Set<PublicSeasonSurface>([
  "rosters",
  "schedule",
  "upcomingGames",
  "scoreboard",
]);

type GateProps = {
  org: string;
  surface: PublicSeasonSurface;
  asOf?: Date;
  registrationStatus?: PublicRegistrationStatus | null;
  completedSeasons?: readonly CompletedSeasonRecord[] | null;
  standingsLabel?: string | null;
  children: React.ReactNode;
};

/**
 * Off-season Spring leagues replace operational children with the notice.
 * Every other org and every in-season Spring league receives `children` unchanged.
 */
export function PublicOperationalGate({
  org,
  surface,
  asOf,
  registrationStatus,
  completedSeasons,
  standingsLabel,
  children,
}: GateProps) {
  if (
    OPERATIONAL_SURFACES.has(surface) &&
    isSpringContentOrg(org) &&
    isSpringPublicOffSeason(org, asOf)
  ) {
    return (
      <OffSeasonNotice
        org={org}
        asOf={asOf}
        registrationStatus={registrationStatus}
        completedSeasons={completedSeasons}
        standingsLabel={standingsLabel}
      />
    );
  }
  return children;
}

type StandingsProps = {
  org: string;
  seasonName: string;
  asOf?: Date;
  completedSeasons?: readonly CompletedSeasonRecord[] | null;
  standingsLabel?: string | null;
  children: React.ReactNode;
};

export function PublicStandingsSection({
  org,
  seasonName,
  asOf,
  completedSeasons,
  standingsLabel,
  children,
}: StandingsProps) {
  const phase = isSpringContentOrg(org) ? springPublicPhase(org, asOf) : null;
  const resolvedStandingsLabel = !isSpringContentOrg(org)
    ? null
    : standingsLabel !== undefined
      ? standingsLabel
      : finalStandingsLabel(org, asOf, completedSeasons);

  if (phase === "before" && !resolvedStandingsLabel && isSpringContentOrg(org)) {
    return (
      <>
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight md:text-5xl">
            Standings
          </h1>
          <p className="text-zinc-400">{offSeasonSeasonInfoMessage(org, asOf)}</p>
        </div>
        {children}
      </>
    );
  }

  if ((phase === "after" || phase === "before") && resolvedStandingsLabel && isSpringContentOrg(org)) {
    const seasonTitle = resolvedStandingsLabel.replace(/ Final Standings$/, "");
    return (
      <>
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight md:text-5xl">
            {resolvedStandingsLabel}
          </h1>
          <p className="text-zinc-400">
            Final results from {phase === "after" ? getSeasonLabel(org) : seasonTitle}. These
            standings stay posted through the off-season.
          </p>
        </div>
        {children}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight md:text-5xl">
            League Standings
          </h1>
          <p className="text-zinc-400">
            {seasonName} · by age group with current scored results.
          </p>
        </div>
        <Link
          href="/schedule"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 sm:self-auto"
        >
          View Schedule
        </Link>
      </div>
      {children}
    </>
  );
}

export function springOffSeasonOrg(
  org: string | null | undefined,
  asOf?: Date,
): SpringContentOrgId | null {
  if (isSpringContentOrg(org) && isSpringPublicOffSeason(org, asOf)) return org;
  return null;
}
