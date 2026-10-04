"use client";

import { useEffect, useMemo, useState } from "react";

import { calculatedRange } from "@/lib/ageDivisions/compute";
import {
  blankDivision,
  builtinSeasonView,
  clearDivisionBirthdates,
  divisionAgesSourceLabel,
  moveDivision,
  seasonCutoffIso,
  setAllDivisionRosters,
  setDivisionBirthdate,
  setDivisionRoster,
  stripBirthdatesMatchingCutoff,
} from "@/lib/ageDivisions/draft";
import {
  coverageWarningLinesForConfig,
  divisionTableTsvForConfig,
  formatCalendarDate,
  leagueRuleSentenceForRule,
  lookupLeagueForConfig,
  seasonAgeHeadlineForRule,
} from "@/lib/ageDivisions/present";
import { validateLeagueDefaults, validateSeasonWrite, type SeasonDivisionAgesView } from "@/lib/ageDivisions/schema";
import type { DivisionAgeConfig, LeagueDivisionConfig } from "@/lib/ageDivisions/types";
import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";

const fieldClass =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-white";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-60";

type CardState = SeasonDivisionAgesView & {
  dirty: boolean;
  saving: boolean;
  message: string | null;
  fieldErrors: string[];
};

type SettingsDraft = {
  org: ContentOrgId;
  cutoffMonth: number;
  cutoffDay: number;
  yearOffset: number;
  divisions: DivisionAgeConfig[];
  returnRatePercent: number;
  feederSharePercent: number;
  saving: boolean;
  loading: boolean;
  message: string | null;
  fieldErrors: string[];
};

function configOf(view: Pick<SeasonDivisionAgesView, "cutoff" | "divisions">): LeagueDivisionConfig {
  return { rule: view.cutoff, divisions: view.divisions };
}

function cardFromPayload(payload: SeasonDivisionAgesView): CardState {
  return {
    ...payload,
    cutoff: { ...payload.cutoff },
    divisions: payload.divisions.map((division) => ({ ...division })),
    dirty: false,
    saving: false,
    message: null,
    fieldErrors: [],
  };
}

function failedCard(org: ContentOrgId, message: string): CardState {
  return {
    ...builtinSeasonView(org),
    storageNote: message,
    dirty: false,
    saving: false,
    message: null,
    fieldErrors: [],
  };
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return payload;
}

function isSeasonPayload(payload: Record<string, unknown> | null): payload is Record<string, unknown> & SeasonDivisionAgesView {
  return Boolean(payload && payload.cutoff && Array.isArray(payload.divisions) && typeof payload.source === "string");
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3V21M3.5 12h2.2M18.3 12H21M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" />
    </svg>
  );
}

function issueLines(payload: Record<string, unknown> | null, fallback: string): string[] {
  if (payload && Array.isArray(payload.issues) && payload.issues.every((issue) => typeof issue === "string")) {
    return payload.issues as string[];
  }
  if (payload && typeof payload.error === "string") return [payload.error];
  return [fallback];
}

export function DivisionAgesSettingsDialog({
  seasonYear,
  draft,
  onDraft,
  onSave,
  onClose,
  onStartFromLastSeason,
  onResetSeason,
}: {
  seasonYear: number;
  draft: SettingsDraft;
  onDraft: (next: SettingsDraft) => void;
  onSave: () => void;
  onClose: () => void;
  onStartFromLastSeason: () => void;
  onResetSeason: () => void;
}) {
  const [setAllMin, setSetAllMin] = useState("");
  const [setAllMax, setSetAllMax] = useState("");
  const preview = seasonAgeHeadlineForRule(
    draft.org,
    { cutoffMonth: draft.cutoffMonth, cutoffDay: draft.cutoffDay, yearOffset: draft.yearOffset },
    seasonYear,
  );

  function patchDivision(index: number, patch: Partial<DivisionAgeConfig>) {
    onDraft({
      ...draft,
      divisions: draft.divisions.map((division, divisionIndex) =>
        divisionIndex === index ? { ...division, ...patch } : division,
      ),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 sm:items-center sm:p-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="division-ages-settings-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">League defaults</p>
            <h3 id="division-ages-settings-title" className="mt-1 text-xl font-semibold text-white">
              {getOrgDisplayName(draft.org)} settings
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              These defaults apply when a season has no saved table. A saved season keeps its own copy until you reset it.
            </p>
          </div>
          <button type="button" className={buttonClass} onClick={onClose}>
            Close
          </button>
        </div>

        {draft.loading ? <p className="text-sm text-zinc-300">Loading league defaults…</p> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cutoff month</span>
            <select
              className={fieldClass}
              value={draft.cutoffMonth}
              onChange={(event) => onDraft({ ...draft, cutoffMonth: Number(event.target.value) })}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cutoff day</span>
            <input
              className={fieldClass}
              inputMode="numeric"
              value={draft.cutoffDay}
              onChange={(event) => onDraft({ ...draft, cutoffDay: Number(event.target.value) })}
            />
          </label>
          <label className="text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Year offset</span>
            <select
              className={fieldClass}
              value={draft.yearOffset}
              onChange={(event) => onDraft({ ...draft, yearOffset: Number(event.target.value) })}
            >
              <option value={-1}>-1</option>
              <option value={0}>0</option>
              <option value={1}>+1</option>
              <option value={2}>+2</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-sm text-zinc-200" data-testid="division-ages-cutoff-preview">
          {preview}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Return rate %</span>
            <input
              className={fieldClass}
              inputMode="decimal"
              aria-label="Return rate percent"
              data-testid="return-rate-percent"
              value={draft.returnRatePercent}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw !== "" && !/^\d{0,3}(\.\d{0,2})?$/.test(raw)) return;
                onDraft({ ...draft, returnRatePercent: raw === "" ? 0 : Number(raw) });
              }}
            />
          </label>
          <label className="text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Feeder share %</span>
            <input
              className={fieldClass}
              inputMode="decimal"
              aria-label="Feeder share percent"
              data-testid="feeder-share-percent"
              value={draft.feederSharePercent}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw !== "" && !/^\d{0,3}(\.\d{0,2})?$/.test(raw)) return;
                onDraft({ ...draft, feederSharePercent: raw === "" ? 0 : Number(raw) });
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Return rate is the share of players expected back next season. 100% means no drop-off. Feeder share is the
          portion of Ascension players added to each Gonzales division after players already in Gonzales are removed.
          Spring→Fall carryover is reference only.
        </p>

        <div className="mt-5 rounded-xl border border-zinc-800 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Roster size (min–max)</p>
          <p className="mt-1 text-sm text-zinc-400">Blank uses the default 11–12. Applies to every division below.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              aria-label="Set all roster minimum"
              className={`${fieldClass} w-24`}
              inputMode="numeric"
              placeholder="11"
              value={setAllMin}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "" || /^\d{1,2}$/.test(raw)) setSetAllMin(raw);
              }}
            />
            <span aria-hidden="true" className="text-zinc-500">–</span>
            <input
              aria-label="Set all roster maximum"
              className={`${fieldClass} w-24`}
              inputMode="numeric"
              placeholder="12"
              value={setAllMax}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === "" || /^\d{1,2}$/.test(raw)) setSetAllMax(raw);
              }}
            />
            <button
              type="button"
              className={buttonClass}
              data-testid="roster-set-all"
              onClick={() =>
                onDraft({
                  ...draft,
                  divisions: setAllDivisionRosters(draft.divisions, setAllMin, setAllMax),
                })
              }
            >
              Set all
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {draft.divisions.map((division, index) => (
            <div key={`${division.sortOrder}-${index}`} className="rounded-xl border border-zinc-800 p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_5rem_5rem_auto]">
                <input
                  aria-label={`Default code ${index + 1}`}
                  className={fieldClass}
                  value={division.code}
                  onChange={(event) => patchDivision(index, { code: event.target.value })}
                />
                <input
                  aria-label={`Default label ${index + 1}`}
                  className={fieldClass}
                  value={division.label}
                  onChange={(event) => patchDivision(index, { label: event.target.value })}
                />
                <input
                  aria-label={`Default minimum age ${index + 1}`}
                  className={fieldClass}
                  inputMode="numeric"
                  value={division.minAge}
                  onChange={(event) => patchDivision(index, { minAge: Number(event.target.value) })}
                />
                <input
                  aria-label={`Default maximum age ${index + 1}`}
                  className={fieldClass}
                  inputMode="numeric"
                  value={division.maxAge}
                  onChange={(event) => patchDivision(index, { maxAge: Number(event.target.value) })}
                />
                <div className="flex gap-2">
                  <button type="button" className={buttonClass} onClick={() => onDraft({ ...draft, divisions: moveDivision(draft.divisions, index, -1) })}>
                    Up
                  </button>
                  <button type="button" className={buttonClass} onClick={() => onDraft({ ...draft, divisions: moveDivision(draft.divisions, index, 1) })}>
                    Down
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => onDraft({ ...draft, divisions: draft.divisions.filter((_, divisionIndex) => divisionIndex !== index) })}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="w-full text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Roster size (min–max)</span>
                <input
                  aria-label={`Roster minimum ${index + 1}`}
                  className={`${fieldClass} w-24`}
                  inputMode="numeric"
                  placeholder="11"
                  value={division.rosterMin ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw !== "" && !/^\d{1,2}$/.test(raw)) return;
                    onDraft({
                      ...draft,
                      divisions: draft.divisions.map((item, divisionIndex) =>
                        divisionIndex === index ? setDivisionRoster(item, "rosterMin", raw) : item,
                      ),
                    });
                  }}
                />
                <span aria-hidden="true" className="text-zinc-500">–</span>
                <input
                  aria-label={`Roster maximum ${index + 1}`}
                  className={`${fieldClass} w-24`}
                  inputMode="numeric"
                  placeholder="12"
                  value={division.rosterMax ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw !== "" && !/^\d{1,2}$/.test(raw)) return;
                    onDraft({
                      ...draft,
                      divisions: draft.divisions.map((item, divisionIndex) =>
                        divisionIndex === index ? setDivisionRoster(item, "rosterMax", raw) : item,
                      ),
                    });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={`${buttonClass} mt-3`}
          onClick={() => onDraft({ ...draft, divisions: [...draft.divisions, blankDivision(draft.divisions.length + 1)] })}
        >
          Add default division
        </button>

        {draft.fieldErrors.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-100">
            {draft.fieldErrors.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {draft.message ? <p className="mt-3 text-sm text-zinc-200">{draft.message}</p> : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" className={buttonClass} disabled={draft.saving || draft.loading} onClick={onSave}>
            Save league defaults
          </button>
          <button type="button" className={buttonClass} onClick={onStartFromLastSeason}>
            Start from last season
          </button>
          <button type="button" className={buttonClass} onClick={onResetSeason}>
            Reset season to league defaults
          </button>
        </div>
      </div>
    </div>
  );
}

export function DivisionAgesEditorCard({
  org,
  seasonYear,
  card,
  onCard,
  onSave,
  onOpenSettings,
  copyLabel,
  onCopy,
}: {
  org: ContentOrgId;
  seasonYear: number;
  card: CardState;
  onCard: (next: CardState) => void;
  onSave: (confirm: boolean) => void;
  onOpenSettings: () => void;
  copyLabel: string;
  onCopy: () => void;
}) {
  const config = configOf(card);
  const warnings = coverageWarningLinesForConfig(config, seasonYear);
  const cutoffIso = seasonCutoffIso(card.cutoff, seasonYear);

  function patchDivision(index: number, next: DivisionAgeConfig) {
    onCard({
      ...card,
      dirty: true,
      divisions: card.divisions.map((division, divisionIndex) => (divisionIndex === index ? next : division)),
    });
  }

  return (
    <section data-testid={`division-ages-${org}`} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-white">{getOrgDisplayName(org)}</h2>
          <p className="mt-1 text-sm font-medium text-zinc-100" data-testid={`division-ages-source-${org}`}>
            {divisionAgesSourceLabel(card.source, seasonYear)}
          </p>
          <p className="mt-1 text-sm text-zinc-300">{seasonAgeHeadlineForRule(org, card.cutoff, seasonYear)}</p>
          <p className="mt-1 text-sm text-zinc-500">{leagueRuleSentenceForRule(org, card.cutoff)}</p>
          {card.confirmedAt ? (
            <p className="mt-1 text-sm text-emerald-200">Confirmed {formatCalendarDate(card.confirmedAt.slice(0, 10))}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            aria-label={`${getOrgDisplayName(org)} division age settings`}
            onClick={onOpenSettings}
          >
            <GearIcon />
            <span className="ml-2">Settings</span>
          </button>
          <button type="button" className={buttonClass} onClick={onCopy}>
            {copyLabel}
          </button>
        </div>
      </div>

      {card.storageNote ? (
        <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100" role="status">
          {card.storageNote}
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100" data-testid="coverage-warnings">
          <p className="font-semibold text-amber-50">Coverage warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2 text-amber-50/80">Warnings do not block a save.</p>
        </div>
      ) : (
        <p className="mb-4 text-sm text-zinc-500">No gaps or overlaps.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-semibold">Order</th>
              <th className="py-2 pr-3 font-semibold">Division</th>
              <th className="py-2 pr-3 font-semibold">Ages</th>
              <th className="py-2 pr-3 font-semibold">Oldest birthdate</th>
              <th className="py-2 pr-3 font-semibold">Youngest birthdate</th>
              <th className="py-2 font-semibold">Row</th>
            </tr>
          </thead>
          <tbody>
            {card.divisions.map((division, index) => {
              const calculated = calculatedRange(division, cutoffIso);
              const oldestValue = division.oldestBirthdate ?? calculated.oldest;
              const youngestValue = division.youngestBirthdate ?? calculated.youngest;
              return (
                <tr key={`${division.code}-${index}`} className="border-t border-zinc-800 align-top text-zinc-200">
                  <td className="py-2 pr-3">
                    <div className="flex flex-col gap-2">
                      <button type="button" className={buttonClass} onClick={() => onCard({ ...card, dirty: true, divisions: moveDivision(card.divisions, index, -1) })}>
                        Up
                      </button>
                      <button type="button" className={buttonClass} onClick={() => onCard({ ...card, dirty: true, divisions: moveDivision(card.divisions, index, 1) })}>
                        Down
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      aria-label={`Code ${index + 1}`}
                      className={`${fieldClass} mb-2`}
                      value={division.code}
                      onChange={(event) => patchDivision(index, { ...division, code: event.target.value })}
                    />
                    <input
                      aria-label={`Label ${index + 1}`}
                      className={fieldClass}
                      value={division.label}
                      onChange={(event) => patchDivision(index, { ...division, label: event.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      <input
                        aria-label={`Minimum age ${index + 1}`}
                        className={`${fieldClass} w-20`}
                        inputMode="numeric"
                        value={division.minAge}
                        onChange={(event) =>
                          patchDivision(
                            index,
                            stripBirthdatesMatchingCutoff(
                              { ...division, minAge: Number(event.target.value) },
                              cutoffIso,
                            ),
                          )
                        }
                      />
                      <input
                        aria-label={`Maximum age ${index + 1}`}
                        className={`${fieldClass} w-20`}
                        inputMode="numeric"
                        value={division.maxAge}
                        onChange={(event) =>
                          patchDivision(
                            index,
                            stripBirthdatesMatchingCutoff(
                              { ...division, maxAge: Number(event.target.value) },
                              cutoffIso,
                            ),
                          )
                        }
                      />
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <DateCell
                      label={`Oldest birthdate ${index + 1}`}
                      value={oldestValue}
                      overridden={Boolean(division.oldestBirthdate)}
                      onChange={(value) => patchDivision(index, setDivisionBirthdate(division, "oldestBirthdate", value, cutoffIso))}
                      onReset={() => patchDivision(index, setDivisionBirthdate(division, "oldestBirthdate", "", cutoffIso))}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <DateCell
                      label={`Youngest birthdate ${index + 1}`}
                      value={youngestValue}
                      overridden={Boolean(division.youngestBirthdate)}
                      onChange={(value) => patchDivision(index, setDivisionBirthdate(division, "youngestBirthdate", value, cutoffIso))}
                      onReset={() => patchDivision(index, setDivisionBirthdate(division, "youngestBirthdate", "", cutoffIso))}
                    />
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col gap-2">
                      {division.oldestBirthdate || division.youngestBirthdate ? (
                        <button type="button" className={buttonClass} onClick={() => patchDivision(index, clearDivisionBirthdates(division))}>
                          Reset to calculated
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() =>
                          onCard({
                            ...card,
                            dirty: true,
                            divisions: card.divisions.filter((_, divisionIndex) => divisionIndex !== index),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        className={`${buttonClass} mt-3`}
        onClick={() =>
          onCard({
            ...card,
            dirty: true,
            divisions: [...card.divisions, blankDivision(card.divisions.length + 1)],
          })
        }
      >
        Add division
      </button>

      {card.fieldErrors.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-100">
          {card.fieldErrors.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {card.message ? <p className="mt-3 text-sm text-zinc-200">{card.message}</p> : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" data-testid="save-division-ages" className={buttonClass} disabled={card.saving} onClick={() => onSave(false)}>
          Save
        </button>
        <button type="button" className={buttonClass} disabled={card.saving} onClick={() => onSave(true)}>
          Mark confirmed
        </button>
      </div>
    </section>
  );
}

function DateCell({
  label,
  value,
  overridden,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  overridden: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div>
      <input aria-label={label} type="date" className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)} />
      {overridden ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-100">
            Edited
          </span>
          <button type="button" className={buttonClass} onClick={onReset}>
            Reset to calculated
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function DivisionAgesWorkspace({
  orgs,
  defaultSeasonYear,
  seasonYears,
}: {
  orgs: ContentOrgId[];
  defaultSeasonYear: number;
  seasonYears: number[];
}) {
  const [seasonYear, setSeasonYear] = useState(defaultSeasonYear);
  const [pendingSeasonYear, setPendingSeasonYear] = useState<number | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [copiedOrg, setCopiedOrg] = useState<ContentOrgId | null>(null);
  const [settings, setSettings] = useState<SettingsDraft | null>(null);
  const [confirm, setConfirm] = useState<{ org: ContentOrgId; kind: "copy" | "reset" } | null>(null);
  const orgsKey = orgs.join(",");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const entries = await Promise.all(
          orgs.map(async (org) => {
            const response = await fetch(
              `/api/admin/division-ages/season?org=${encodeURIComponent(org)}&seasonYear=${seasonYear}`,
              { cache: "no-store" },
            );
            const payload = await readJson(response);
            if (!response.ok || !isSeasonPayload(payload)) {
              const message = payload && typeof payload.error === "string" ? payload.error : "Could not load saved division ages.";
              return [org, failedCard(org, message)] as const;
            }
            return [org, cardFromPayload(payload)] as const;
          }),
        );
        if (!cancelled) setCards(Object.fromEntries(entries));
      } catch {
        if (!cancelled) {
          setLoadError("Could not load saved division ages. Showing built-in defaults.");
          setCards(Object.fromEntries(orgs.map((org) => [org, failedCard(org, "Could not load saved division ages. Showing built-in defaults.")])));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgsKey, seasonYear, orgs]);

  const birthdateReady = /^\d{4}-\d{2}-\d{2}$/.test(birthDate);
  const lookups = useMemo(() => {
    if (!birthdateReady) return [];
    return orgs.map((org) => {
      const card = cards[org] ?? failedCard(org, "");
      return lookupLeagueForConfig(org, configOf(card), birthDate, seasonYear);
    });
  }, [birthdateReady, orgs, cards, birthDate, seasonYear]);
  const split = new Set(lookups.map((lookup) => lookup.leagueAge).filter((age) => Number.isFinite(age))).size > 1;

  function requestSeasonYear(year: number) {
    if (Object.values(cards).some((card) => card.dirty)) {
      setPendingSeasonYear(year);
      return;
    }
    setSeasonYear(year);
  }

  async function reloadOrg(org: ContentOrgId) {
    const response = await fetch(
      `/api/admin/division-ages/season?org=${encodeURIComponent(org)}&seasonYear=${seasonYear}`,
      { cache: "no-store" },
    );
    const payload = await readJson(response);
    if (!response.ok || !isSeasonPayload(payload)) {
      const lines = issueLines(payload, "Could not refresh division ages.");
      setCards((current) => ({
        ...current,
        [org]: { ...(current[org] ?? failedCard(org, lines[0] ?? "")), saving: false, fieldErrors: lines, message: null },
      }));
      return;
    }
    setCards((current) => ({ ...current, [org]: cardFromPayload(payload) }));
  }

  async function saveSeason(org: ContentOrgId, confirmSave: boolean) {
    const card = cards[org];
    if (!card) return;
    const parsed = validateSeasonWrite(
      { cutoff: card.cutoff, divisions: card.divisions, confirm: confirmSave },
      seasonYear,
    );
    if (!parsed.ok || parsed.data.reset) {
      setCards((current) => ({
        ...current,
        [org]: { ...card, fieldErrors: parsed.ok ? ["Could not save division ages."] : parsed.issues, message: null },
      }));
      return;
    }
    setCards((current) => ({ ...current, [org]: { ...card, saving: true, fieldErrors: [], message: null } }));
    const response = await fetch(
      `/api/admin/division-ages/season?org=${encodeURIComponent(org)}&seasonYear=${seasonYear}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cutoff: parsed.data.cutoff,
          divisions: parsed.data.divisions,
          confirm: parsed.data.confirm,
        }),
      },
    );
    const payload = await readJson(response);
    if (!response.ok || !isSeasonPayload(payload)) {
      setCards((current) => ({
        ...current,
        [org]: { ...card, saving: false, fieldErrors: issueLines(payload, "Could not save division ages."), message: null },
      }));
      return;
    }
    setCards((current) => ({
      ...current,
      [org]: { ...cardFromPayload(payload), message: confirmSave ? "Marked confirmed." : "Saved." },
    }));
  }

  async function openSettings(org: ContentOrgId) {
    setSettings({
      org,
      cutoffMonth: 4,
      cutoffDay: 30,
      yearOffset: 0,
      divisions: [],
      returnRatePercent: 100,
      feederSharePercent: 10,
      saving: false,
      loading: true,
      message: null,
      fieldErrors: [],
    });
    const response = await fetch(`/api/admin/division-ages/defaults?org=${encodeURIComponent(org)}`, { cache: "no-store" });
    const payload = await readJson(response);
    if (!response.ok || !payload || !Array.isArray(payload.divisions)) {
      setSettings((current) =>
        current && current.org === org
          ? { ...current, loading: false, fieldErrors: issueLines(payload, "Could not load league defaults.") }
          : current,
      );
      return;
    }
    setSettings({
      org,
      cutoffMonth: Number(payload.cutoffMonth),
      cutoffDay: Number(payload.cutoffDay),
      yearOffset: Number(payload.yearOffset),
      divisions: (payload.divisions as DivisionAgeConfig[]).map((division) => ({ ...division })),
      returnRatePercent: typeof payload.returnRatePercent === "number" ? payload.returnRatePercent : 100,
      feederSharePercent: typeof payload.feederSharePercent === "number" ? payload.feederSharePercent : 10,
      saving: false,
      loading: false,
      message: typeof payload.storageNote === "string" ? payload.storageNote : null,
      fieldErrors: [],
    });
  }

  async function saveSettings() {
    if (!settings) return;
    const parsed = validateLeagueDefaults(settings);
    if (!parsed.ok) {
      setSettings({ ...settings, fieldErrors: parsed.issues, message: null });
      return;
    }
    setSettings({ ...settings, saving: true, fieldErrors: [], message: null });
    const response = await fetch(`/api/admin/division-ages/defaults?org=${encodeURIComponent(settings.org)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      setSettings((current) =>
        current ? { ...current, saving: false, fieldErrors: issueLines(payload, "Could not save league defaults.") } : current,
      );
      return;
    }
    const card = cards[settings.org];
    const seasonIsSaved = card?.source === "season";
    const keepOnScreenEdits = Boolean(card?.dirty);
    const message = seasonIsSaved
      ? "League defaults saved. This season still uses its saved table until you reset it."
      : keepOnScreenEdits
        ? "League defaults saved. Unsaved edits on this season are still on screen."
        : "League defaults saved.";
    setSettings((current) => (current ? { ...current, saving: false, message } : current));
    if (!seasonIsSaved && !keepOnScreenEdits) await reloadOrg(settings.org);
  }

  async function runConfirmedAction() {
    if (!confirm) return;
    const { org, kind } = confirm;
    setConfirm(null);
    setSettings(null);
    const card = cards[org];
    if (card) setCards((current) => ({ ...current, [org]: { ...card, saving: true, fieldErrors: [], message: null } }));
    const response =
      kind === "copy"
        ? await fetch(`/api/admin/division-ages/copy?org=${encodeURIComponent(org)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ fromSeasonYear: seasonYear - 1, toSeasonYear: seasonYear }),
          })
        : await fetch(`/api/admin/division-ages/season?org=${encodeURIComponent(org)}&seasonYear=${seasonYear}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ resetToLeagueDefaults: true }),
          });
    const payload = await readJson(response);
    if (!response.ok || !isSeasonPayload(payload)) {
      const lines = issueLines(payload, kind === "copy" ? "Could not start from last season." : "Could not reset this season.");
      setCards((current) => ({
        ...current,
        [org]: { ...(current[org] ?? failedCard(org, lines[0] ?? "")), saving: false, fieldErrors: lines, message: null },
      }));
      return;
    }
    setCards((current) => ({
      ...current,
      [org]: {
        ...cardFromPayload(payload),
        message: kind === "copy" ? `Started from ${seasonYear - 1}.` : "Reset to league defaults.",
      },
    }));
  }

  async function copyTable(org: ContentOrgId) {
    const card = cards[org];
    if (!card) return;
    try {
      await navigator.clipboard.writeText(divisionTableTsvForConfig(configOf(card), seasonYear));
      setCopiedOrg(org);
    } catch {
      setCopiedOrg(null);
      setCards((current) => ({
        ...current,
        [org]: { ...card, message: "Could not copy. Select the table and copy it by hand." },
      }));
    }
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100" role="status">
          {loadError}
        </p>
      ) : null}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block w-full text-sm text-zinc-300 sm:w-auto">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Season year</span>
            <select
              value={seasonYear}
              onChange={(event) => requestSeasonYear(Number(event.target.value))}
              className={`${fieldClass} sm:w-36`}
            >
              {seasonYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-full text-sm text-zinc-300 sm:w-auto" data-testid="eligibility-lookup">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Birthdate lookup</span>
            <input
              type="date"
              value={birthDate}
              autoComplete="off"
              onChange={(event) => setBirthDate(event.target.value)}
              className={`${fieldClass} sm:w-52`}
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-zinc-500">The lookup stays in this browser. Save stores the table for this season.</p>
        {loading ? <p className="mt-4 text-sm text-zinc-300">Loading saved division ages…</p> : null}
        {birthdateReady ? (
          <div className="mt-4 space-y-3">
            {split ? (
              <p>
                <span data-testid="split-window" className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                  Split window
                </span>
              </p>
            ) : null}
            <ul className="space-y-3">
              {lookups.map((lookup) => (
                <li key={lookup.org} className="text-sm text-zinc-200">
                  <p className="font-semibold text-white">
                    {getOrgDisplayName(lookup.org)}:{" "}
                    {Number.isFinite(lookup.leagueAge) ? `league age ${lookup.leagueAge} (${lookup.exactAgeLabel})` : "age could not be read"}
                  </p>
                  {lookup.divisionLabels.length > 0 ? (
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {lookup.divisionLabels.map((label) => (
                        <li key={label} className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200">
                          {label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-zinc-400">no division</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">Enter a birthdate to see eligibility.</p>
        )}
      </div>

      {orgs.map((org) => {
        const card = cards[org];
        if (!card) return null;
        return (
          <DivisionAgesEditorCard
            key={org}
            org={org}
            seasonYear={seasonYear}
            card={card}
            onCard={(next) => setCards((current) => ({ ...current, [org]: next }))}
            onSave={(confirmSave) => {
              void saveSeason(org, confirmSave);
            }}
            onOpenSettings={() => {
              void openSettings(org);
            }}
            copyLabel={copiedOrg === org ? "Copied" : "Copy table"}
            onCopy={() => {
              void copyTable(org);
            }}
          />
        );
      })}

      {settings ? (
        <DivisionAgesSettingsDialog
          seasonYear={seasonYear}
          draft={settings}
          onDraft={setSettings}
          onSave={() => {
            void saveSettings();
          }}
          onClose={() => setSettings(null)}
          onStartFromLastSeason={() => setConfirm({ org: settings.org, kind: "copy" })}
          onResetSeason={() => setConfirm({ org: settings.org, kind: "reset" })}
        />
      ) : null}

      {confirm ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-3 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="division-ages-confirm-title" className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-5">
            <h3 id="division-ages-confirm-title" className="text-lg font-semibold text-white">
              {confirm.kind === "copy" ? "Start from last season?" : "Reset this season?"}
            </h3>
            <p className="mt-2 text-sm text-zinc-300">
              {confirm.kind === "copy"
                ? `Replace the ${seasonYear} table with ${seasonYear - 1}'s saved divisions. Codes, labels, and ages stay. Overridden birthdates move forward one year, and Feb 29 becomes Feb 28.`
                : `Replace the ${seasonYear} table with this league's defaults. Saved overrides for ${seasonYear} will be cleared.`}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" className={buttonClass} onClick={() => { void runConfirmedAction(); }}>
                Replace table
              </button>
              <button type="button" className={buttonClass} onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingSeasonYear != null ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-3 sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-5">
            <h3 className="text-lg font-semibold text-white">Leave unsaved edits?</h3>
            <p className="mt-2 text-sm text-zinc-300">Changing the season year clears edits that have not been saved.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setSeasonYear(pendingSeasonYear);
                  setPendingSeasonYear(null);
                }}
              >
                Change season
              </button>
              <button type="button" className={buttonClass} onClick={() => setPendingSeasonYear(null)}>
                Stay
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
