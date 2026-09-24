import Link from "next/link";

import DivisionStandingsTable from "@/components/admin/dashboard/DivisionStandingsTable";
import GameDayPanel from "@/components/admin/dashboard/GameDayPanel";
import { ScoreCompletenessChart, WeeklyScoresChart } from "@/components/admin/dashboard/SeasonCharts";
import type { GameDayStatus } from "@/lib/admin/dashboard/gameDay";
import type { AssignrSyncView, DistrictIncomeView, OperationsView } from "@/lib/admin/dashboard/loadInSeasonBoard";
import type { SeasonDashboardLinks } from "@/lib/admin/dashboard/seasonLinks";
import {
  formatDashboardCents,
  type OrgSeasonPicture,
  type SeasonPulseTone,
  type WeekGameRow,
} from "@/lib/admin/dashboard/seasonPulse";
import type { ContentOrgId } from "@/lib/siteConfig";

const UNSCORED_LIMIT = 12;

const TONE_CLASS: Record<SeasonPulseTone, string> = {
  neutral: "border-zinc-800 bg-zinc-950/70",
  attention: "border-amber-500/40 bg-amber-950/30",
  failure: "border-red-500/40 bg-red-950/40",
};

export type SeasonFinanceSlice = {
  collectedCents: number;
  outstandingCents: number;
  grossCents: number;
  divisions: {
    ageGroup: string;
    enrolled: number;
    rostered: number;
    collectedCents: number;
    grossCents: number;
  }[];
};

const SCORE_STATE_LABEL: Record<WeekGameRow["scoreState"], string> = {
  scored: "Scored",
  missing: "Missing",
  scheduled: "Not started",
  "not-entered": "Not entered here",
  canceled: "Canceled",
  "rained-out": "Rained out",
};

export default function InSeasonBoard({
  pictures,
  gameDayByOrg,
  syncByOrg,
  operationsByOrg,
  linksByOrg,
  financeByOrg,
  district,
  districtHref,
}: {
  pictures: OrgSeasonPicture[];
  gameDayByOrg: Partial<Record<ContentOrgId, GameDayStatus>>;
  syncByOrg: Partial<Record<ContentOrgId, AssignrSyncView>>;
  operationsByOrg: Partial<Record<ContentOrgId, OperationsView>>;
  linksByOrg: Partial<Record<ContentOrgId, SeasonDashboardLinks>>;
  financeByOrg: Partial<Record<ContentOrgId, SeasonFinanceSlice>>;
  district: DistrictIncomeView | null;
  districtHref: string | null;
}) {
  return (
    <div className="mb-8 space-y-8" data-season-dashboard="in-season">
      {pictures.map((picture) => (
        <OrgSeasonSection
          key={picture.organizationId}
          picture={picture}
          gameDay={gameDayByOrg[picture.organizationId] ?? null}
          sync={syncByOrg[picture.organizationId] ?? null}
          operations={operationsByOrg[picture.organizationId] ?? null}
          links={linksByOrg[picture.organizationId] ?? null}
          finance={financeByOrg[picture.organizationId] ?? null}
        />
      ))}
      {district ? <DistrictIncomeCard district={district} href={districtHref} /> : null}
    </div>
  );
}

function OrgSeasonSection({
  picture,
  gameDay,
  sync,
  operations,
  links,
  finance,
}: {
  picture: OrgSeasonPicture;
  gameDay: GameDayStatus | null;
  sync: AssignrSyncView | null;
  operations: OperationsView | null;
  links: SeasonDashboardLinks | null;
  finance: SeasonFinanceSlice | null;
}) {
  const hiddenUnscored = Math.max(0, picture.unscored.length - UNSCORED_LIMIT);
  return (
    <section className="space-y-6" data-season-org={picture.organizationId}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          {picture.organizationLabel} season record
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Posted league games and saved scores for {picture.seasonLabel}. This is a snapshot from when the page opened.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {picture.chips.map((chip) => (
          <div key={chip.key} className={`rounded-full border px-3 py-2 ${TONE_CLASS[chip.tone]}`}>
            <span className="mr-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">{chip.label}</span>
            <span className="text-sm font-semibold text-zinc-100">{chip.value}</span>
          </div>
        ))}
      </div>

      {gameDay ? <GameDayPanel status={gameDay} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {picture.kpis.map((kpi) => (
          <div key={kpi.key} className={`rounded-xl border p-4 ${TONE_CLASS[kpi.tone]}`}>
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">{kpi.label}</div>
            <div className="mt-1 text-2xl font-black text-white">{kpi.value}</div>
            <p className="mt-1 text-xs text-zinc-400">{kpi.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ScoreCompletenessChart rows={picture.completenessByAge} />
        <WeeklyScoresChart rows={picture.weekly} />
      </div>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-bold text-white">Scores still open</h3>
          {links?.scores ? (
            <Link href={links.scores} className="text-sm font-semibold text-zinc-200 underline-offset-2 hover:underline">
              Open Scores
            </Link>
          ) : null}
        </div>
        {picture.unscored.length === 0 ? (
          <p className="text-sm text-zinc-500">Every started score-entry game has a saved score.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Late</th>
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Division</th>
                  <th className="px-2 py-2">Game</th>
                  <th className="px-2 py-2">Place</th>
                </tr>
              </thead>
              <tbody>
                {picture.unscored.slice(0, UNSCORED_LIMIT).map((row) => (
                  <tr key={row.id} className="border-t border-zinc-800">
                    <td className="px-2 py-2 text-red-200">{row.daysLate === 0 ? "Today" : `${row.daysLate}d`}</td>
                    <td className="px-2 py-2">{row.when}</td>
                    <td className="px-2 py-2">{row.ageGroup}</td>
                    <td className="px-2 py-2 text-white">{row.matchup}</td>
                    <td className="px-2 py-2 text-zinc-400">{row.place}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hiddenUnscored > 0 ? (
              <p className="mt-3 text-xs text-zinc-500">
                {hiddenUnscored} more row{hiddenUnscored === 1 ? "" : "s"} not shown.
                {links?.scores ? " Open Scores for the full queue." : ""}
              </p>
            ) : null}
          </div>
        )}
      </section>

      <DivisionStandingsTable divisions={picture.divisions} defaultAgeGroup={picture.defaultAgeGroup} />

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <h3 className="text-base font-bold text-white">This week by park</h3>
        <p className="mt-1 mb-3 text-sm text-zinc-400">Posted and canceled games, sorted by park and time.</p>
        {picture.weekGames.length === 0 ? (
          <p className="text-sm text-zinc-500">No posted games this week.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Park</th>
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Division</th>
                  <th className="px-2 py-2">Game</th>
                  <th className="px-2 py-2">Field</th>
                  <th className="px-2 py-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {picture.weekGames.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-800">
                    <td className="px-2 py-2 text-white">{row.parkName}</td>
                    <td className="px-2 py-2">{row.when}</td>
                    <td className="px-2 py-2">{row.ageGroup}</td>
                    <td className="px-2 py-2">{row.matchup}</td>
                    <td className="px-2 py-2 text-zinc-400">{row.fieldName}</td>
                    <td className={`px-2 py-2 ${row.scoreState === "missing" ? "text-red-200" : row.scoreState === "rained-out" ? "text-red-200" : row.scoreState === "canceled" ? "text-amber-200" : "text-zinc-300"}`}>
                      {SCORE_STATE_LABEL[row.scoreState]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UmpireStrip sync={sync} links={links} />
      {operations && links ? <OperationsRow operations={operations} links={links} /> : null}
      {finance && links ? (
        <FinanceDetails finance={finance} open={picture.financeOpen} enrollmentHref={links.enrollment} />
      ) : null}
    </section>
  );
}

function UmpireStrip({
  sync,
  links,
}: {
  sync: AssignrSyncView | null;
  links: SeasonDashboardLinks | null;
}) {
  const tone: SeasonPulseTone =
    sync?.status === "FAILED" ? "failure" : sync?.status === "PARTIAL" || (sync?.failedCount ?? 0) > 0 ? "attention" : "neutral";
  const when = sync?.atIso
    ? new Date(sync.atIso).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  return (
    <section className={`rounded-2xl border p-5 ${TONE_CLASS[tone]}`} data-season-umpires="true">
      <h3 className="text-base font-bold text-white">Umpires</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Assignment coverage is not stored in league records.
        {links?.assignr
          ? " Open Assignr to see who is on tonight's games."
          : " An admin opens Assignr to see who is on tonight's games."}
      </p>
      <p className="mt-3 text-sm text-zinc-200">
        {sync?.status === "NONE" || !sync
          ? "No Assignr sync has been recorded for this organization."
          : `Last sync ${sync.status.toLowerCase()}${when ? ` · ${when}` : ""} · ${sync.successCount} succeeded · ${sync.failedCount} failed`}
      </p>
      {sync?.errorMessage ? <p className="mt-1 text-sm text-red-200">{sync.errorMessage}</p> : null}
      <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
        {links?.umpirePay ? (
          <Link href={links.umpirePay} className="text-zinc-100 underline-offset-2 hover:underline">
            Umpire pay
          </Link>
        ) : null}
        {links?.assignr ? (
          <Link href={links.assignr} className="text-zinc-100 underline-offset-2 hover:underline" data-season-assignr-link="true">
            Open Assignr
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function OperationsRow({
  operations,
  links,
}: {
  operations: OperationsView;
  links: SeasonDashboardLinks;
}) {
  const items = [
    { label: "Schedule conflicts", count: operations.conflictGames, href: links.scheduler },
    { label: "Player names to review", count: operations.nameCollisions, href: links.sportsConnect },
    { label: "Equipment still out", count: operations.openEquipment, href: links.teams },
  ];
  const clear = items.every((item) => item.count === 0);
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5" data-season-operations="true">
      <h3 className="text-base font-bold text-white">Operations health</h3>
      {clear ? (
        <p className="mt-2 text-sm text-zinc-400">No schedule conflicts, name collisions, or open equipment checkouts.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {items.map((item) => (
            <div key={item.label} className={`rounded-xl border px-3 py-2 text-sm ${item.count > 0 ? TONE_CLASS.attention : TONE_CLASS.neutral}`}>
              {item.href ? (
                <Link href={item.href} className="text-zinc-100">
                  {item.label}: <span className="font-bold">{item.count}</span>
                </Link>
              ) : (
                <span>
                  {item.label}: <span className="font-bold">{item.count}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FinanceDetails({
  finance,
  open,
  enrollmentHref,
}: {
  finance: SeasonFinanceSlice;
  open: boolean;
  enrollmentHref: string | null;
}) {
  return (
    <details open={open} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
      <summary className="cursor-pointer text-base font-bold text-white">
        Registration money · {formatDashboardCents(finance.outstandingCents)} still out
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MoneyTile label="Collected" value={formatDashboardCents(finance.collectedCents)} />
        <MoneyTile label="Outstanding" value={formatDashboardCents(finance.outstandingCents)} />
        <MoneyTile label="Gross" value={formatDashboardCents(finance.grossCents)} />
      </div>
      {finance.divisions.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2">Division</th>
                <th className="px-2 py-2">Enrolled</th>
                <th className="px-2 py-2">Rostered</th>
                <th className="px-2 py-2">Collected</th>
              </tr>
            </thead>
            <tbody>
              {finance.divisions.map((division) => (
                <tr key={division.ageGroup} className="border-t border-zinc-800">
                  <td className="px-2 py-2 text-white">{division.ageGroup}</td>
                  <td className="px-2 py-2">{division.enrolled}</td>
                  <td className="px-2 py-2">{division.rostered}</td>
                  <td className="px-2 py-2">{formatDashboardCents(division.collectedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No registration rows for this season.</p>
      )}
      {enrollmentHref ? (
        <Link href={enrollmentHref} className="mt-3 inline-block text-sm font-semibold text-zinc-100 underline-offset-2 hover:underline">
          Open enrollment
        </Link>
      ) : null}
    </details>
  );
}

function MoneyTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-black text-white">{value}</div>
    </div>
  );
}

function DistrictIncomeCard({
  district,
  href,
}: {
  district: DistrictIncomeView;
  href: string | null;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5" data-season-district="true">
      <h3 className="text-base font-bold text-white">{district.organizationLabel} tournament payments</h3>
      <p className="mt-1 text-sm text-zinc-400">
        PayPal rows stored for {district.seasonYear}. This is not registration money and it is not added to any league total.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MoneyTile label="Net" value={formatDashboardCents(district.netCents)} />
        <MoneyTile label="Gross" value={formatDashboardCents(district.grossCents)} />
        <MoneyTile label="Needs review" value={String(district.unmatchedCount)} />
      </div>
      {district.categories.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm text-zinc-300">
          {district.categories.map((category) => (
            <li key={category.label} className="flex justify-between gap-4 border-t border-zinc-800 py-1">
              <span>{category.label}</span>
              <span>
                {category.count} · {formatDashboardCents(category.netCents)} net
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No payments stored for this year.</p>
      )}
      {href ? (
        <Link href={href} className="mt-3 inline-block text-sm font-semibold text-zinc-100 underline-offset-2 hover:underline">
          Open tournament income
        </Link>
      ) : null}
    </section>
  );
}
