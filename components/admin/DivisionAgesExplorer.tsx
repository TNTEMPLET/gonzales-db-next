"use client";

import { useState } from "react";

import {
  coverageWarningLines,
  divisionAgeRows,
  divisionTableTsv,
  leagueRuleSentence,
  lookupIsSplit,
  lookupLeague,
  seasonAgeHeadline,
} from "@/lib/ageDivisions/present";
import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";

type DivisionAgesViewProps = {
  orgs: ContentOrgId[];
  seasonYear: number;
  seasonYears: number[];
  onSeasonYearChange: (year: number) => void;
  birthDate: string;
  onBirthDateChange: (value: string) => void;
};

function isCompleteBirthdate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function DivisionAgesView({
  orgs,
  seasonYear,
  seasonYears,
  onSeasonYearChange,
  birthDate,
  onBirthDateChange,
}: DivisionAgesViewProps) {
  const [copiedOrg, setCopiedOrg] = useState<ContentOrgId | null>(null);
  const [copyFailedOrg, setCopyFailedOrg] = useState<ContentOrgId | null>(null);
  const birthdateReady = isCompleteBirthdate(birthDate);
  const split = birthdateReady && lookupIsSplit(orgs, birthDate, seasonYear);

  async function copyTable(org: ContentOrgId) {
    try {
      await navigator.clipboard.writeText(divisionTableTsv(org, seasonYear));
      setCopiedOrg(org);
      setCopyFailedOrg(null);
    } catch {
      setCopiedOrg(null);
      setCopyFailedOrg(org);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">Built-in defaults. Editing comes later.</p>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block w-full text-sm text-zinc-300 sm:w-auto">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Season year
            </span>
            <select
              value={seasonYear}
              onChange={(event) => onSeasonYearChange(Number(event.target.value))}
              className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-white sm:w-36"
            >
              {seasonYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="block w-full min-w-0 text-sm text-zinc-300 sm:w-auto" data-testid="eligibility-lookup">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              Birthdate lookup
            </span>
            <input
              type="date"
              value={birthDate}
              autoComplete="off"
              onChange={(event) => onBirthDateChange(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-white sm:w-52"
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          Lookups stay in this browser. Nothing is saved.
        </p>

        {birthdateReady ? (
          <div className="mt-4 space-y-3">
            {split ? (
              <p>
                <span
                  data-testid="split-window"
                  className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200"
                >
                  Split window
                </span>
              </p>
            ) : null}
            <ul className="space-y-3">
              {orgs.map((org) => {
                const lookup = lookupLeague(org, birthDate, seasonYear);
                const ageText = Number.isFinite(lookup.leagueAge)
                  ? `league age ${lookup.leagueAge} (${lookup.exactAgeLabel})`
                  : "age could not be read";
                return (
                  <li key={org} className="text-sm text-zinc-200">
                    <p className="font-semibold text-white">
                      {getOrgDisplayName(org)}: {ageText}
                    </p>
                    {lookup.divisionLabels.length > 0 ? (
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {lookup.divisionLabels.map((label) => (
                          <li
                            key={label}
                            className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                          >
                            {label}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-zinc-400">no division</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">Enter a birthdate to see eligibility.</p>
        )}
      </div>

      <div className="space-y-6">
        {orgs.map((org) => {
          const rows = divisionAgeRows(org, seasonYear);
          const warnings = coverageWarningLines(org, seasonYear);
          return (
            <section
              key={org}
              data-testid={`division-ages-${org}`}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6"
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-white">{getOrgDisplayName(org)}</h2>
                  <p className="mt-1 text-sm text-zinc-300">{seasonAgeHeadline(org, seasonYear)}</p>
                  <p className="mt-1 text-sm text-zinc-500">{leagueRuleSentence(org)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void copyTable(org);
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500"
                >
                  {copiedOrg === org ? "Copied" : "Copy table"}
                </button>
              </div>
              {copyFailedOrg === org ? (
                <p className="mb-3 text-sm text-amber-200" role="status">
                  Could not copy. Select the table and copy it by hand.
                </p>
              ) : null}
              <p className="mb-3 text-xs text-zinc-500">
                Copy table puts division, min age, max age, oldest, and youngest on the clipboard as TSV.
              </p>

              {warnings.length > 0 ? (
                <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <p className="font-semibold text-amber-50">Coverage warnings</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {warnings.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mb-4 text-sm text-zinc-500">No gaps or overlaps.</p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Division</th>
                      <th className="py-2 pr-3 font-semibold">Ages</th>
                      <th className="py-2 pr-3 font-semibold">Oldest birthdate</th>
                      <th className="py-2 font-semibold">Youngest birthdate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.code} className="border-t border-zinc-800 text-zinc-200">
                        <td className="py-2 pr-3">{row.label}</td>
                        <td className="whitespace-nowrap py-2 pr-3">{row.ageSpan}</td>
                        <td className="whitespace-nowrap py-2 pr-3">{row.oldestLabel}</td>
                        <td className="whitespace-nowrap py-2">{row.youngestLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default function DivisionAgesExplorer({
  orgs,
  defaultSeasonYear,
  seasonYears,
}: {
  orgs: ContentOrgId[];
  defaultSeasonYear: number;
  seasonYears: number[];
}) {
  const [seasonYear, setSeasonYear] = useState(defaultSeasonYear);
  const [birthDate, setBirthDate] = useState("");

  return (
    <DivisionAgesView
      orgs={orgs}
      seasonYear={seasonYear}
      seasonYears={seasonYears}
      onSeasonYearChange={setSeasonYear}
      birthDate={birthDate}
      onBirthDateChange={setBirthDate}
    />
  );
}
