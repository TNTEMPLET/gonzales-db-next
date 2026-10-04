import Link from "next/link";

import {
  finalStandingsLabel,
  offSeasonSeasonInfoMessage,
  registrationOffSeasonCopy,
  springPublicPhase,
  type CompletedSeasonRecord,
  type PublicRegistrationStatus,
  type SpringContentOrgId,
} from "@/lib/publicSeason/offSeason";

type Props = {
  org: SpringContentOrgId;
  asOf?: Date;
  registrationStatus?: PublicRegistrationStatus | null;
  completedSeasons?: readonly CompletedSeasonRecord[] | null;
  /**
   * Precomputed label from schedule data. Pass null to hide the link.
   * Omit to derive it from `asOf` and `completedSeasons`.
   */
  standingsLabel?: string | null;
  showStandingsLink?: boolean;
};

export function OffSeasonNotice({
  org,
  asOf,
  registrationStatus,
  completedSeasons,
  standingsLabel,
  showStandingsLink = true,
}: Props) {
  const registration = registrationOffSeasonCopy(registrationStatus);
  const phase = springPublicPhase(org, asOf);
  const resolvedStandingsLabel =
    standingsLabel !== undefined
      ? standingsLabel
      : finalStandingsLabel(org, asOf, completedSeasons);
  return (
    <section
      data-testid="off-season-notice"
      className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6"
    >
      <p className="mb-4 inline-flex rounded-full bg-zinc-800 px-4 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-zinc-300">
        {phase === "before" ? "UPCOMING SEASON" : "OFF SEASON"}
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {phase === "before" ? "Season info is on the way" : "See you next season"}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-zinc-300">
        {offSeasonSeasonInfoMessage(org, asOf)}
      </p>
      {registration.statusText ? (
        <p className="mt-4 text-zinc-400">{registration.statusText}</p>
      ) : null}
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/registration"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-purple px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-purple-dark"
        >
          {registration.actionLabel}
        </Link>
        {showStandingsLink && resolvedStandingsLabel ? (
          <Link
            href="/standings"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 px-6 py-3 text-sm font-semibold text-brand-gold transition hover:bg-zinc-900"
          >
            {resolvedStandingsLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function OffSeasonPage({
  org,
  asOf,
  registrationStatus,
  completedSeasons,
  standingsLabel,
}: {
  org: SpringContentOrgId;
  asOf?: Date;
  registrationStatus?: PublicRegistrationStatus | null;
  completedSeasons?: readonly CompletedSeasonRecord[] | null;
  standingsLabel?: string | null;
}) {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <OffSeasonNotice
        org={org}
        asOf={asOf}
        registrationStatus={registrationStatus}
        completedSeasons={completedSeasons}
        standingsLabel={standingsLabel}
      />
    </main>
  );
}
