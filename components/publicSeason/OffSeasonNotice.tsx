import Link from "next/link";

import {
  finalStandingsLabel,
  offSeasonSeasonInfoMessage,
  registrationOffSeasonCopy,
  type PublicRegistrationStatus,
  type SpringContentOrgId,
} from "@/lib/publicSeason/offSeason";

type Props = {
  org: SpringContentOrgId;
  registrationStatus?: PublicRegistrationStatus | null;
  showStandingsLink?: boolean;
};

export function OffSeasonNotice({
  org,
  registrationStatus,
  showStandingsLink = true,
}: Props) {
  const registration = registrationOffSeasonCopy(registrationStatus);
  return (
    <section
      data-testid="off-season-notice"
      className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6"
    >
      <p className="mb-4 inline-flex rounded-full bg-zinc-800 px-4 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-zinc-300">
        OFF SEASON
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
        See you next season
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-zinc-300">
        {offSeasonSeasonInfoMessage(org)}
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
        {showStandingsLink ? (
          <Link
            href="/standings"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 px-6 py-3 text-sm font-semibold text-brand-gold transition hover:bg-zinc-900"
          >
            {finalStandingsLabel(org)}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function OffSeasonPage({
  org,
  registrationStatus,
}: {
  org: SpringContentOrgId;
  registrationStatus?: PublicRegistrationStatus | null;
}) {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <OffSeasonNotice org={org} registrationStatus={registrationStatus} />
    </main>
  );
}
