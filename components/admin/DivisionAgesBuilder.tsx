"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { DivisionAgesForecastTimeline, type TimelineCount } from "@/components/admin/DivisionAgesForecastTimeline";
import {
  BUILDER_CHARTERS,
  BUILDER_CUTOFFS,
  CORRUPT_BUILDER_NOTICE,
  addBuilderRow,
  backupUnreadableBuilderRaw,
  blankBuilderTable,
  builderCoverageIssues,
  builderForecastProposed,
  builderLeagueTimelines,
  builderOverlapRowIds,
  builderRowViews,
  replaceWholeBuilderTable,
  restoreBuilderUndo,
  builderStorageKey,
  classifyBuilderRaw,
  clearBuilderTable,
  createBuilderRowId,
  formatBirthdateWindow,
  moveBuilderRow,
  parseBuilderTable,
  patchForCharterChange,
  removeBuilderRow,
  saveBuilderTable,
  serializeBuilderTable,
  startOverBuilderTable,
  updateBuilderRow,
  type BuilderCharter,
  type BuilderCutoff,
  type BuilderIssue,
  type BuilderRow,
  type BuilderRowView,
  type BuilderTable,
  type BuilderWindow,
} from "@/lib/ageDivisions/divisionBuilder";
import { formatCalendarDate } from "@/lib/ageDivisions/present";
import { MAX_DIVISION_COUNT } from "@/lib/ageDivisions/schema";
import { SPRING_BUILDER_ORG, springCombinedBuilderTable } from "@/lib/admin/springCombined/view";
import {
  FORECAST_CAVEATS,
  FORECAST_DEBOUNCE_MS,
  betweenDivisionCount,
  buildForecastRequest,
  coverageLabel,
  dataSourceLabel,
  forecastQueryKey,
  formatTeamRange,
  isForecastResponse,
  populationTotal,
  type ForecastResponse,
} from "@/lib/ageDivisions/forecastView";
import { formatOrganizationIdDisplay, type ContentOrgId } from "@/lib/siteConfig";

const fieldClass =
  "min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-100 hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60";
const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-100 bg-zinc-100 px-3 text-sm font-semibold text-zinc-950 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BUILDER_STORE_EVENT = "apbaseball-division-builder";

function subscribeBuilderStore(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(BUILDER_STORE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(BUILDER_STORE_EVENT, callback);
  };
}

function notifyBuilderStore() {
  window.dispatchEvent(new Event(BUILDER_STORE_EVENT));
}

function readBuilderRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeBuilderRaw(table: BuilderTable) {
  saveBuilderTable(window.localStorage, table);
  notifyBuilderStore();
}

function tableFromRaw(raw: string | null, organizationId: string, seasonYear: number): BuilderTable {
  const blank = blankBuilderTable(organizationId, seasonYear);
  if (!raw) return blank;
  const parsed = parseBuilderTable(raw);
  if (!parsed.ok) return blank;
  if (parsed.table.organizationId !== organizationId || parsed.table.seasonYear !== seasonYear) return blank;
  return parsed.table;
}

type Mode = "table" | "wizard";
type Step = 1 | 2 | 3 | 4;

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Season" },
  { id: 2, label: "Divisions" },
  { id: 3, label: "Cutoffs" },
  { id: 4, label: "Review" },
];

function isContentOrg(value: string, orgs: readonly ContentOrgId[]): value is ContentOrgId {
  return orgs.some((org) => org === value);
}

export function DivisionAgesBuilder({
  orgs,
  defaultSeasonYear,
  seasonYears,
  initialTable,
  initialMode,
  initialStep = 1,
  persist = true,
  showSpringTemplate = false,
}: {
  orgs: ContentOrgId[];
  defaultSeasonYear: number;
  seasonYears: number[];
  initialTable?: BuilderTable;
  initialMode?: Mode;
  initialStep?: Step;
  /** When false, the table stays in memory. The page uses browser storage. */
  persist?: boolean;
  /** Master Spring combined view. Scratch template only; nothing is saved to a league. */
  showSpringTemplate?: boolean;
}) {
  const firstOrg = orgs[0] ?? "gonzales";
  const seed = initialTable ?? blankBuilderTable(firstOrg, defaultSeasonYear);
  const [context, setContext] = useState({ organizationId: seed.organizationId, seasonYear: seed.seasonYear });
  const [memoryTable, setMemoryTable] = useState<BuilderTable>(seed);
  const storageKey = builderStorageKey(context.organizationId, context.seasonYear);
  const storedRaw = useSyncExternalStore(subscribeBuilderStore, () => readBuilderRaw(storageKey), () => null);
  const storedTable = useMemo(
    () => tableFromRaw(storedRaw, context.organizationId, context.seasonYear),
    [storedRaw, context.organizationId, context.seasonYear],
  );
  const [storageBlocked, setStorageBlocked] = useState(false);
  const table = persist && !storageBlocked ? storedTable : memoryTable;
  const [mode, setMode] = useState<Mode>(initialMode ?? (seed.rows.length === 0 ? "wizard" : "table"));
  const [removed, setRemoved] = useState<{ row: BuilderRow; index: number } | null>(null);
  const layoutStatus =
    persist && !storageBlocked ? classifyBuilderRaw(storedRaw, context.organizationId, context.seasonYear) : "empty";

  useEffect(() => {
    if (layoutStatus !== "corrupt") return;
    try {
      backupUnreadableBuilderRaw(window.localStorage, context.organizationId, context.seasonYear);
    } catch {
      // The notice still tells the admin the saved layout could not be read.
    }
  }, [layoutStatus, context.organizationId, context.seasonYear]);
  const [step, setStep] = useState<Step>(initialStep);
  const [includeFeeder, setIncludeFeeder] = useState(seed.organizationId === "gonzales");
  const [sourceSeason, setSourceSeason] = useState(previousSeason(seed.seasonYear, seasonYears));
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  const focusId = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = focusId.current;
    if (!id) return;
    focusId.current = null;
    document.getElementById(`builder-name-${id}`)?.focus();
  }, [table]);

  const views = useMemo(() => builderRowViews(table), [table]);
  const issues = useMemo(() => builderCoverageIssues(table), [table]);
  const structural = issues.filter((issue) => issue.kind !== "incomplete");
  const years = useMemo(() => {
    const values = new Set(seasonYears);
    values.add(table.seasonYear);
    return [...values].filter((year) => Number.isInteger(year)).sort((a, b) => a - b);
  }, [seasonYears, table.seasonYear]);
  const showCounts = views.length > 0 && (mode === "table" || step === 4);

  function edit(next: BuilderTable, options?: { keepUndo?: boolean }) {
    setConfirmReset(false);
    if (!options?.keepUndo) setRemoved(null);
    if (!persist || storageBlocked) {
      setMemoryTable(next);
      return;
    }
    try {
      writeBuilderRaw(next);
    } catch {
      setStorageBlocked(true);
      setMemoryTable(next);
      setImportError("This browser blocked saving the scratch table. Your edits stay on screen until you leave.");
    }
  }

  function patchRow(id: string, patch: Partial<Omit<BuilderRow, "id">>) {
    edit(updateBuilderRow(table, id, patch));
  }

  function removeRow(id: string) {
    const index = table.rows.findIndex((row) => row.id === id);
    if (index < 0) return;
    setRemoved({ row: { ...table.rows[index]! }, index });
    edit(removeBuilderRow(table, id), { keepUndo: true });
  }

  function undoRemove() {
    if (!removed) return;
    const next = restoreBuilderUndo(table, removed);
    if (!next.rows.some((row) => row.id === removed.row.id)) return;
    edit(next);
  }

  function addDivision(patch: Partial<Omit<BuilderRow, "id">> = {}) {
    if (table.rows.length >= MAX_DIVISION_COUNT) return;
    const id = createBuilderRowId();
    focusId.current = id;
    edit(addBuilderRow(table, patch, id));
  }

  function switchContext(organizationId: string, seasonYear: number) {
    if (organizationId === table.organizationId && seasonYear === table.seasonYear) return;
    const replaced = replaceWholeBuilderTable(blankBuilderTable(organizationId, seasonYear));
    setConfirmReset(false);
    setRemoved(replaced.pendingUndo);
    setImportError(null);
    setIncludeFeeder(organizationId === "gonzales");
    setSourceSeason(previousSeason(seasonYear, seasonYears));
    setContext({ organizationId, seasonYear });
    if (!persist || storageBlocked) setMemoryTable(replaced.table);
  }

  function onExport() {
    const blob = new Blob([serializeBuilderTable(table)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `division-builder-${table.organizationId}-${table.seasonYear}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function onImportRaw(raw: string) {
    const parsed = parseBuilderTable(raw);
    if (!parsed.ok) {
      setImportError(parsed.error);
      return;
    }
    if (parsed.table.organizationId === SPRING_BUILDER_ORG) {
      if (!showSpringTemplate) {
        setImportError("This file is the Spring combined scratch table. Open Spring (combined) to load it.");
        return;
      }
    } else if (!isContentOrg(parsed.table.organizationId, orgs)) {
      setImportError("This file is for a different league. Open that league, then import it there.");
      return;
    }
    const replaced = replaceWholeBuilderTable(parsed.table);
    setContext({ organizationId: replaced.table.organizationId, seasonYear: replaced.table.seasonYear });
    setSourceSeason(previousSeason(replaced.table.seasonYear, seasonYears));
    setIncludeFeeder(replaced.table.organizationId === "gonzales");
    setImportError(null);
    setConfirmReset(false);
    setRemoved(replaced.pendingUndo);
    if (!persist || storageBlocked) {
      setMemoryTable(replaced.table);
      return;
    }
    try {
      writeBuilderRaw(replaced.table);
    } catch {
      setStorageBlocked(true);
      setImportError("This browser blocked saving the imported table.");
      setMemoryTable(replaced.table);
    }
  }

  function applyWholeTable(next: BuilderTable) {
    const replaced = replaceWholeBuilderTable(next);
    setConfirmReset(false);
    setConfirmTemplate(false);
    setImportError(null);
    setRemoved(replaced.pendingUndo);
    setIncludeFeeder(next.organizationId === "gonzales");
    setSourceSeason(previousSeason(next.seasonYear, seasonYears));
    setContext({ organizationId: next.organizationId, seasonYear: next.seasonYear });
    setMode("table");
    if (!persist || storageBlocked) {
      setMemoryTable(replaced.table);
      return;
    }
    try {
      writeBuilderRaw(replaced.table);
    } catch {
      setStorageBlocked(true);
      setMemoryTable(replaced.table);
      setImportError("This browser blocked saving the scratch table. Your edits stay on screen until you leave.");
    }
  }

  function onUseSpringTemplate() {
    if (table.rows.length > 0 && !confirmTemplate) {
      setConfirmTemplate(true);
      return;
    }
    applyWholeTable(springCombinedBuilderTable(table.seasonYear));
  }

  function onStartOver() {
    const replaced = replaceWholeBuilderTable(startOverBuilderTable(table));
    setConfirmReset(false);
    setImportError(null);
    setRemoved(replaced.pendingUndo);
    if (!persist || storageBlocked) {
      setMemoryTable(replaced.table);
      return;
    }
    try {
      clearBuilderTable(window.localStorage, table.organizationId, table.seasonYear);
      notifyBuilderStore();
    } catch {
      setStorageBlocked(true);
      setMemoryTable(replaced.table);
    }
  }

  const orgOptions =
    isContentOrg(table.organizationId, orgs) || table.organizationId === SPRING_BUILDER_ORG
      ? orgs
      : [table.organizationId as ContentOrgId, ...orgs];

  return (
    <div className="space-y-6" data-testid="division-builder">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Scratch pad</p>
        <h2 className="mt-1 text-2xl font-semibold text-white">Division Builder</h2>
        <p className="mt-2 max-w-3xl text-sm text-zinc-300">
          Gonzales Diamond Youth and Ascension Little League share one registration portal. This table starts blank so
          any admin can try division ages before changing the saved table. It stays in this browser for{" "}
          {builderLeagueLabel(table.organizationId)} {table.seasonYear}. It does not change saved Division Ages
          or registration.
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="How do you want to work">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "table"}
            className={mode === "table" ? primaryClass : buttonClass}
            onClick={() => setMode("table")}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              setMode(mode === "table" ? "wizard" : "table");
            }}
          >
            Table
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "wizard"}
            className={mode === "wizard" ? primaryClass : buttonClass}
            data-testid="builder-mode-wizard"
            onClick={() => setMode("wizard")}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              setMode(mode === "table" ? "wizard" : "table");
            }}
          >
            Step by step
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={onExport}>
            Save to file
          </button>
          <button type="button" className={buttonClass} onClick={() => fileRef.current?.click()}>
            Load from file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Load a saved division layout file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void file.text().then(onImportRaw).catch(() => setImportError("Could not read that file."));
            }}
          />
          {confirmReset ? (
            <>
              <button type="button" className={primaryClass} onClick={onStartOver}>
                Yes, clear the table
              </button>
              <button type="button" className={buttonClass} onClick={() => setConfirmReset(false)}>
                Keep my divisions
              </button>
            </>
          ) : (
            <button type="button" className={buttonClass} data-testid="builder-start-over" onClick={() => setConfirmReset(true)}>
              Start over
            </button>
          )}
          {showSpringTemplate ? (
            confirmTemplate ? (
              <>
                <button type="button" className={primaryClass} onClick={onUseSpringTemplate}>
                  Yes, use the Spring template
                </button>
                <button type="button" className={buttonClass} onClick={() => setConfirmTemplate(false)}>
                  Keep my divisions
                </button>
              </>
            ) : (
              <button
                type="button"
                className={buttonClass}
                data-testid="spring-combined-template"
                onClick={onUseSpringTemplate}
              >
                Spring combined template
              </button>
            )
          ) : null}
        </div>
        <p className="mt-3 text-xs text-zinc-500">Saved files use JSON.</p>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-200">Paste saved layout</summary>
          <PasteJson onImport={onImportRaw} />
        </details>
        {layoutStatus === "corrupt" ? (
          <p className="mt-3 text-sm text-amber-200" role="alert">
            {CORRUPT_BUILDER_NOTICE}
          </p>
        ) : null}
        {removed ? (
          <p className="mt-3 text-sm text-zinc-200" role="status">
            Removed {removed.row.name.trim() || "that division"}.{" "}
            <button type="button" className={buttonClass} onClick={undoRemove}>
              Undo
            </button>
          </p>
        ) : null}
        {importError ? (
          <p className="mt-3 text-sm text-amber-200" role="alert">
            {importError}
          </p>
        ) : null}
        {confirmReset ? (
          <p className="mt-3 text-sm text-zinc-300" role="status">
            Start over clears every division for this league and season in this browser.
          </p>
        ) : null}
        {confirmTemplate ? (
          <p className="mt-3 text-sm text-zinc-300" role="status">
            The Spring combined template replaces the divisions in this scratch table. It stays in this browser.
          </p>
        ) : null}
      </div>

      {mode === "wizard" ? (
        <Wizard
          step={step}
          onStep={setStep}
          table={table}
          views={views}
          issues={issues}
          orgOptions={orgOptions}
          years={years}
          showSpringTemplate={showSpringTemplate}
          onContext={switchContext}
          onAdd={() => addDivision()}
          onPatch={patchRow}
          onRemove={removeRow}
          onMove={(id, direction) => edit(moveBuilderRow(table, id, direction))}
          atMax={table.rows.length >= MAX_DIVISION_COUNT}
        />
      ) : (
        <div className="space-y-4">
          <SeasonFields
            table={table}
            orgOptions={orgOptions}
            years={years}
            showSpringTemplate={showSpringTemplate}
            onContext={switchContext}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primaryClass} onClick={() => addDivision()} disabled={table.rows.length >= MAX_DIVISION_COUNT}>
              Add a division
            </button>
            <p className="text-sm text-zinc-400">
              {table.rows.length} of {MAX_DIVISION_COUNT}. Use Tab to move through fields. Move up and Move down change
              the order.
            </p>
          </div>
          <IssueList issues={structural} />
          {views.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-700 px-4 py-8 text-sm text-zinc-300" data-testid="builder-empty">
              No divisions yet. Add one, then set its ages, league, and cutoff. Little League uses August 31. Dixie and
              Diamond use April 30. Rows in the same table can use different cutoffs.
            </p>
          ) : (
            <BuilderTable
              views={views}
              onPatch={patchRow}
              onRemove={removeRow}
              onMove={(id, direction) => edit(moveBuilderRow(table, id, direction))}
            />
          )}
        </div>
      )}

      {showCounts ? (
        <BuilderCounts
          table={table}
          views={views}
          sourceSeason={sourceSeason}
          years={years}
          includeFeeder={includeFeeder}
          onSourceSeason={setSourceSeason}
          onIncludeFeeder={setIncludeFeeder}
        />
      ) : null}
    </div>
  );
}

function previousSeason(seasonYear: number, seasonYears: readonly number[]): number {
  if (seasonYears.includes(seasonYear - 1)) return seasonYear - 1;
  const earlier = seasonYears.filter((year) => year < seasonYear);
  if (earlier.length > 0) return Math.max(...earlier);
  return seasonYear;
}

function builderLeagueLabel(organizationId: string): string {
  if (organizationId === SPRING_BUILDER_ORG) return "Spring (combined)";
  return formatOrganizationIdDisplay(organizationId);
}

function SeasonFields({
  table,
  orgOptions,
  years,
  showSpringTemplate = false,
  onContext,
}: {
  table: BuilderTable;
  orgOptions: readonly ContentOrgId[];
  years: readonly number[];
  showSpringTemplate?: boolean;
  onContext: (organizationId: string, seasonYear: number) => void;
}) {
  const showLeaguePicker = orgOptions.length > 1 || showSpringTemplate;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showLeaguePicker ? (
        <label className="block text-sm text-zinc-300">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">League</span>
          <select
            className={fieldClass}
            value={table.organizationId}
            onChange={(event) => onContext(event.target.value, table.seasonYear)}
          >
            {showSpringTemplate ? <option value={SPRING_BUILDER_ORG}>Spring (combined)</option> : null}
            {orgOptions.map((org) => (
              <option key={org} value={org}>
                {formatOrganizationIdDisplay(org)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-zinc-300">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">League</span>
          {builderLeagueLabel(table.organizationId)}
        </p>
      )}
      <label className="block text-sm text-zinc-300">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Season you are planning</span>
        <select
          className={fieldClass}
          aria-describedby="builder-season-help"
          value={table.seasonYear}
          onChange={(event) => onContext(table.organizationId, Number(event.target.value))}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
          <span id="builder-season-help" className="mt-1 block text-xs text-zinc-500">
          Birthdate windows use this season. Switching season loads the scratch table for that season.
        </span>
      </label>
    </div>
  );
}

function PasteJson({ onImport }: { onImport: (raw: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <label className="block text-sm text-zinc-300">
        <span className="sr-only">Division builder JSON</span>
        <textarea
          className={`${fieldClass} min-h-28 py-2 font-mono text-sm`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder='{"version":1,"organizationId":"gonzales","seasonYear":2027,"rows":[]}'
        />
      </label>
      <button type="button" className={buttonClass} onClick={() => onImport(text)}>
        Use this layout
      </button>
    </div>
  );
}

function IssueList({ issues }: { issues: readonly BuilderIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      {issues.map((issue) => (
        <p
          key={`${issue.kind}-${issue.message}`}
          role="status"
          data-testid={`builder-${issue.kind}`}
          className={
            issue.kind === "gap"
              ? "rounded-xl border border-red-400/50 bg-red-500/10 px-3 py-2 text-sm text-red-100"
              : "rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
          }
        >
          {issue.message}
        </p>
      ))}
    </div>
  );
}

function WindowLine({ view }: { view: BuilderRowView }) {
  const { window } = view;
  return (
    <p className="text-sm text-zinc-200" data-testid={`builder-window-${view.row.id}`}>
      {window.cutoffClamped ? `That month is shorter, so the cutoff used is ${formatCalendarDate(window.cutoffIso)}. ` : null}
      <span className="font-medium text-white">{window.label.startsWith("born") ? `Players ${window.label}.` : window.label}</span>
    </p>
  );
}

function NameField({ row, onPatch }: { row: BuilderRow; onPatch: (patch: Partial<Omit<BuilderRow, "id">>) => void }) {
  return (
    <label className="block text-sm text-zinc-300">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Division name</span>
      <input
        id={`builder-name-${row.id}`}
        className={fieldClass}
        value={row.name}
        maxLength={80}
        autoComplete="off"
        aria-label={`Division name, ${row.name.trim() || "new row"}`}
        onChange={(event) => onPatch({ name: event.target.value })}
      />
    </label>
  );
}

function AgeFields({ row, onPatch }: { row: BuilderRow; onPatch: (patch: Partial<Omit<BuilderRow, "id">>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block text-sm text-zinc-300">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Low age</span>
        <input
          className={fieldClass}
          type="number"
          min={0}
          max={25}
          inputMode="numeric"
          aria-label={`Low age for ${row.name || "this division"}`}
          value={row.minAge}
          onChange={(event) => {
            if (event.target.value === "") return;
            onPatch({ minAge: Number(event.target.value) });
          }}
        />
      </label>
      <label className="block text-sm text-zinc-300">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">High age</span>
        <input
          className={fieldClass}
          type="number"
          min={0}
          max={25}
          inputMode="numeric"
          aria-label={`High age for ${row.name || "this division"}`}
          value={row.maxAge}
          onChange={(event) => {
            if (event.target.value === "") return;
            onPatch({ maxAge: Number(event.target.value) });
          }}
        />
      </label>
    </div>
  );
}

function CharterField({ row, onPatch }: { row: BuilderRow; onPatch: (patch: Partial<Omit<BuilderRow, "id">>) => void }) {
  return (
    <label className="block text-sm text-zinc-300">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">League</span>
      <select
        className={fieldClass}
        aria-label={`League for ${row.name || "this division"}`}
        value={row.charter}
        onChange={(event) => onPatch(patchForCharterChange(row, event.target.value as BuilderCharter))}
      >
        {BUILDER_CHARTERS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CutoffFields({
  row,
  window,
  onPatch,
}: {
  row: BuilderRow;
  window: BuilderWindow;
  onPatch: (patch: Partial<Omit<BuilderRow, "id">>) => void;
}) {
  const preset = BUILDER_CUTOFFS.find((option) => option.id === row.cutoff);
  return (
    <div className="space-y-3">
      <label className="block text-sm text-zinc-300">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Cutoff this row follows</span>
        <select
          className={fieldClass}
          aria-label={`Cutoff for ${row.name || "this division"}`}
          value={row.cutoff}
          onChange={(event) => onPatch({ cutoff: event.target.value as BuilderCutoff })}
        >
          {BUILDER_CUTOFFS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-zinc-500">{preset?.detail} Rows in this table can follow different cutoffs.</p>
      {row.cutoff === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Month</span>
            <select
              className={fieldClass}
              aria-label={`Custom cutoff month for ${row.name || "this division"}`}
              value={row.customMonth}
              onChange={(event) => onPatch({ customMonth: Number(event.target.value) })}
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {index + 1} — {month}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Day</span>
            <input
              className={fieldClass}
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              aria-label={`Custom cutoff day for ${row.name || "this division"}`}
              value={row.customDay}
              onChange={(event) => {
                if (event.target.value === "") return;
                onPatch({ customDay: Number(event.target.value) });
              }}
            />
          </label>
        </div>
      ) : null}
      <p className="text-xs text-zinc-500">
        Ages are as of {formatCalendarDate(window.cutoffIso) || "the cutoff"}.
      </p>
      <details>
        <summary className="cursor-pointer py-2 text-sm font-semibold text-zinc-200">Advanced</summary>
        <p className="mt-2 text-xs text-zinc-500">
          Year offset 0 uses this season. +1 uses next year’s cutoff, which Fall Ball often needs.
        </p>
        <label className="mt-2 block text-sm text-zinc-300">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Year offset</span>
          <select
            className={fieldClass}
            aria-label={`Year offset for ${row.name || "this division"}`}
            value={row.yearOffset}
            onChange={(event) => onPatch({ yearOffset: Number(event.target.value) })}
          >
            <option value={-1}>−1 (previous year)</option>
            <option value={0}>0 (this season)</option>
            <option value={1}>+1 (next year, Fall Ball)</option>
            <option value={2}>+2</option>
          </select>
        </label>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Oldest birthday</span>
            <input
              className={fieldClass}
              type="date"
              aria-label={`Oldest birthday override for ${row.name || "this division"}`}
              value={row.oldestOverride}
              onChange={(event) => onPatch({ oldestOverride: event.target.value })}
            />
          </label>
          <label className="block text-sm text-zinc-300">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Youngest birthday</span>
            <input
              className={fieldClass}
              type="date"
              aria-label={`Youngest birthday override for ${row.name || "this division"}`}
              value={row.youngestOverride}
              onChange={(event) => onPatch({ youngestOverride: event.target.value })}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Leave the birthdays blank to use the cutoff. A date here replaces the calculated one.</p>
        {row.oldestOverride || row.youngestOverride ? (
          <button
            type="button"
            className={`${buttonClass} mt-2`}
            onClick={() => onPatch({ oldestOverride: "", youngestOverride: "" })}
          >
            Clear overrides
          </button>
        ) : null}
      </details>
    </div>
  );
}

function RowIssues({ view }: { view: BuilderRowView }) {
  if (view.issues.length === 0) return null;
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
      {view.issues.map((issue) => (
        <li key={issue}>{issue}</li>
      ))}
    </ul>
  );
}

function BuilderTable({
  views,
  onPatch,
  onRemove,
  onMove,
}: {
  views: readonly BuilderRowView[];
  onPatch: (id: string, patch: Partial<Omit<BuilderRow, "id">>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  const stickyName =
    "sticky left-0 z-10 min-w-52 border-b border-zinc-800 bg-zinc-950 px-3 py-3 text-left font-normal shadow-[4px_0_8px_rgba(0,0,0,0.35)]";
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800">
      <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">
          Editable division builder. Names, ages, league, and cutoff. Not saved to the league. Scroll sideways on a narrow screen. The division name stays in view.
        </caption>
        <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          <tr>
            <th scope="col" className="sticky left-0 z-20 min-w-52 border-b border-zinc-800 bg-zinc-900 px-3 py-3 font-semibold">
              Division
            </th>
            <th scope="col" className="border-b border-zinc-800 bg-zinc-900 px-3 py-3 font-semibold">Ages</th>
            <th scope="col" className="border-b border-zinc-800 bg-zinc-900 px-3 py-3 font-semibold">League</th>
            <th scope="col" className="border-b border-zinc-800 bg-zinc-900 px-3 py-3 font-semibold">Cutoff</th>
            <th scope="col" className="border-b border-zinc-800 bg-zinc-900 px-3 py-3 font-semibold">
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {views.map((view, index) => {
            const name = view.row.name.trim() || `Division ${index + 1}`;
            return (
              <tr key={view.row.id} className="align-top">
                <th scope="row" className={stickyName}>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={`Move ${name} up`}
                      disabled={index === 0}
                      onClick={() => onMove(view.row.id, "up")}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      aria-label={`Move ${name} down`}
                      disabled={index === views.length - 1}
                      onClick={() => onMove(view.row.id, "down")}
                    >
                      Move down
                    </button>
                  </div>
                  <NameField row={view.row} onPatch={(patch) => onPatch(view.row.id, patch)} />
                  <div className="mt-3">
                    <WindowLine view={view} />
                    <RowIssues view={view} />
                  </div>
                </th>
                <td className="min-w-40 border-b border-zinc-800 px-3 py-3">
                  <AgeFields row={view.row} onPatch={(patch) => onPatch(view.row.id, patch)} />
                </td>
                <td className="min-w-44 border-b border-zinc-800 px-3 py-3">
                  <CharterField row={view.row} onPatch={(patch) => onPatch(view.row.id, patch)} />
                </td>
                <td className="min-w-56 border-b border-zinc-800 px-3 py-3">
                  <CutoffFields
                    row={view.row}
                    window={view.window}
                    onPatch={(patch) => onPatch(view.row.id, patch)}
                  />
                </td>
                <td className="border-b border-zinc-800 px-3 py-3">
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`Remove ${name}`}
                    onClick={() => onRemove(view.row.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Wizard({
  step,
  onStep,
  table,
  views,
  issues,
  orgOptions,
  years,
  showSpringTemplate,
  onContext,
  onAdd,
  onPatch,
  onRemove,
  onMove,
  atMax,
}: {
  step: Step;
  onStep: (step: Step) => void;
  table: BuilderTable;
  views: readonly BuilderRowView[];
  issues: readonly BuilderIssue[];
  orgOptions: readonly ContentOrgId[];
  years: readonly number[];
  showSpringTemplate: boolean;
  onContext: (organizationId: string, seasonYear: number) => void;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<Omit<BuilderRow, "id">>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  atMax: boolean;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
      <nav aria-label="Division builder steps">
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={step === item.id ? primaryClass : buttonClass}
                aria-current={step === item.id ? "step" : undefined}
                onClick={() => onStep(item.id)}
              >
                {item.id}. {item.label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {step === 1 ? (
        <section aria-labelledby="builder-step-season" className="space-y-4">
          <h3 id="builder-step-season" className="text-xl font-semibold text-white">
            1. Pick the season
          </h3>
          <p className="max-w-3xl text-sm text-zinc-300">
            Choose the league and the season you are planning. Each league and season has its own scratch table in this
            browser. The saved Division Ages table is a different screen.
          </p>
          <SeasonFields
            table={table}
            orgOptions={orgOptions}
            years={years}
            showSpringTemplate={showSpringTemplate}
            onContext={onContext}
          />
        </section>
      ) : null}

      {step === 2 ? (
        <section aria-labelledby="builder-step-divisions" className="space-y-4">
          <h3 id="builder-step-divisions" className="text-xl font-semibold text-white">
            2. Add divisions
          </h3>
          <p className="max-w-3xl text-sm text-zinc-300">
            Add each division you want to compare. Name it the way coaches say it, set the age range, and mark which
            league it plays in. Tee-ball can sit on its own row. 9U through 12U can be marked for both leagues.
          </p>
          <button type="button" className={primaryClass} onClick={onAdd} disabled={atMax}>
            Add a division
          </button>
          {views.length === 0 ? <p className="text-sm text-zinc-400">No divisions yet.</p> : null}
          <div className="space-y-4">
            {views.map((view, index) => (
              <article key={view.row.id} className="rounded-2xl border border-zinc-800 p-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  <NameField row={view.row} onPatch={(patch) => onPatch(view.row.id, patch)} />
                  <AgeFields row={view.row} onPatch={(patch) => onPatch(view.row.id, patch)} />
                  <CharterField row={view.row} onPatch={(patch) => onPatch(view.row.id, patch)} />
                </div>
                <RowIssues view={view} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} disabled={index === 0} aria-label={`Move ${view.row.name || "division"} up`} onClick={() => onMove(view.row.id, "up")}>
                    Move up
                  </button>
                  <button type="button" className={buttonClass} disabled={index === views.length - 1} aria-label={`Move ${view.row.name || "division"} down`} onClick={() => onMove(view.row.id, "down")}>
                    Move down
                  </button>
                  <button type="button" className={buttonClass} aria-label={`Remove ${view.row.name || "division"}`} onClick={() => onRemove(view.row.id)}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section aria-labelledby="builder-step-cutoffs" className="space-y-4">
          <h3 id="builder-step-cutoffs" className="text-xl font-semibold text-white">
            3. Choose cutoffs
          </h3>
          <p className="max-w-3xl text-sm text-zinc-300">
            Little League ages players on August 31. Dixie Youth and Diamond Youth age them on April 30. Pick one for
            each row. A 7U row can follow Little League while a 14U row follows Diamond.
          </p>
          {views.length === 0 ? (
            <p className="text-sm text-zinc-400">Add a division first.</p>
          ) : (
            <div className="space-y-4">
              {views.map((view) => (
                <article key={view.row.id} className="rounded-2xl border border-zinc-800 p-4">
                  <h4 className="text-base font-semibold text-white">{view.title}</h4>
                  <p className="mt-1 text-sm text-zinc-400">
                    Ages {view.row.minAge}–{view.row.maxAge}
                  </p>
                  <div className="mt-3">
                    <CutoffFields row={view.row} window={view.window} onPatch={(patch) => onPatch(view.row.id, patch)} />
                  </div>
                  <div className="mt-3">
                    <WindowLine view={view} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {step === 4 ? (
        <section aria-labelledby="builder-step-review" className="space-y-4">
          <h3 id="builder-step-review" className="text-xl font-semibold text-white">
            4. Review gaps, overlaps, and player counts
          </h3>
          <p className="max-w-3xl text-sm text-zinc-300">
            A gap is a birthday that fits in no division in that league. An overlap is a birthday that fits in two
            divisions in the same league. Little League and Diamond are checked separately. A Both leagues row is
            checked with each. Player counts below use registrations you already have. They do not change those
            registrations.
          </p>
          {views.length === 0 ? <p className="text-sm text-zinc-400">Add a division to review it.</p> : null}
          {views.length > 0 && issues.length === 0 ? (
            <p className="rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100" role="status">
              No gaps or overlaps. Inside each league, every birthday from the oldest player to the youngest player fits in one division.
            </p>
          ) : (
            <IssueList issues={issues} />
          )}
          {views.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <caption className="sr-only">Review of division birthdate windows</caption>
                <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-semibold">Division</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Ages</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Cutoff</th>
                    <th scope="col" className="py-2 font-semibold">Who belongs</th>
                  </tr>
                </thead>
                <tbody>
                  {views.map((view) => (
                    <tr key={view.row.id} className="border-t border-zinc-800 text-zinc-200">
                      <td className="py-2 pr-3">{view.title}</td>
                      <td className="whitespace-nowrap py-2 pr-3">
                        {view.row.minAge}–{view.row.maxAge}
                      </td>
                      <td className="py-2 pr-3">{BUILDER_CUTOFFS.find((option) => option.id === view.row.cutoff)?.label}</td>
                      <td className="py-2">{formatBirthdateWindow(view.window, view.window.oldestOverridden || view.window.youngestOverridden)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={step === 1} onClick={() => onStep((step - 1) as Step)}>
          Back
        </button>
        <button type="button" className={primaryClass} disabled={step === 4} onClick={() => onStep((step + 1) as Step)}>
          Next
        </button>
      </div>
    </div>
  );
}

function BuilderCounts({
  table,
  views,
  sourceSeason,
  years,
  includeFeeder,
  onSourceSeason,
  onIncludeFeeder,
}: {
  table: BuilderTable;
  views: readonly BuilderRowView[];
  sourceSeason: number;
  years: readonly number[];
  includeFeeder: boolean;
  onSourceSeason: (year: number) => void;
  onIncludeFeeder: (value: boolean) => void;
}) {
  const draft = useMemo(() => builderForecastProposed(table, views), [table, views]);
  const overlapIds = useMemo(() => new Set(builderOverlapRowIds(table)), [table]);
  const leagueTimelines = useMemo(() => builderLeagueTimelines(table, views), [table, views]);
  const [loaded, setLoaded] = useState<{ key: string; forecast: ForecastResponse | null; error: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const body = useMemo(() => {
    if (!draft.proposed) return null;
    return buildForecastRequest({
      sourceSeason,
      targetSeason: table.seasonYear,
      includeFeeder: table.organizationId === "gonzales" && includeFeeder,
      retentionOverride: null,
      proposed: draft.proposed,
    });
  }, [draft.proposed, includeFeeder, sourceSeason, table.organizationId, table.seasonYear]);
  const requestKey = body ? forecastQueryKey(table.organizationId, body) : "";

  useEffect(() => {
    if (!body) return;
    const controller = new AbortController();
    let cancelled = false;
    const key = requestKey;
    const handle = setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        setLoading(true);
        try {
          const response = await fetch(`/api/admin/division-ages/forecast?org=${encodeURIComponent(table.organizationId)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          const payload: unknown = await response.json().catch(() => null);
          if (cancelled) return;
          if (!response.ok || !isForecastResponse(payload)) {
            const message =
              payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
                ? payload.error
                : "Could not load player counts.";
            setLoaded({ key, forecast: null, error: message });
            return;
          }
          setLoaded({ key, forecast: payload, error: null });
        } catch (caught) {
          if (cancelled || (caught instanceof DOMException && caught.name === "AbortError")) return;
          setLoaded({ key, forecast: null, error: "Could not load player counts." });
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, FORECAST_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(handle);
    };
  }, [body, requestKey, table.organizationId]);

  const forecast = body && loaded?.key === requestKey ? loaded.forecast : null;
  const error = body && loaded?.key === requestKey ? loaded.error : null;

  const counts: TimelineCount[] | null = forecast
    ? forecast.rows.map((row) => ({
        code: row.code,
        label: row.label,
        pool: row.proposed.pool,
        expected: row.proposed.expected,
        minTeams: row.proposed.minTeams,
        maxTeams: row.proposed.maxTeams,
      }))
    : null;
  const byCode = new Map(forecast?.rows.map((row) => [row.code, row]) ?? []);

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6" aria-labelledby="builder-counts-heading">
      <div>
        <h3 id="builder-counts-heading" className="text-xl font-semibold text-white">
          Player and team counts
        </h3>
        <p className="mt-2 max-w-3xl text-sm text-zinc-300">
          These numbers come from the existing forecast. They place players registered in {sourceSeason} into the
          birthdate windows in this table for {table.seasonYear}. Registration rows are not changed, and this table is
          not saved as Division Ages.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-zinc-300">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Count players registered in
          </span>
          <select className={fieldClass} value={sourceSeason} onChange={(event) => onSourceSeason(Number(event.target.value))}>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        {table.organizationId === "gonzales" ? (
          <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-100">
            <input
              type="checkbox"
              checked={includeFeeder}
              onChange={(event) => onIncludeFeeder(event.target.checked)}
            />
            Include Ascension players who are not already in Gonzales
          </label>
        ) : null}
      </div>
      {draft.skipped.length > 0 ? (
        <p className="text-sm text-amber-100" role="status">
          Left out of the counts until they are complete: {draft.skipped.join(", ")}.
        </p>
      ) : null}
      {draft.error ? (
        <p className="text-sm text-amber-100" role="status">
          {draft.error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-zinc-400">Counting players…</p> : null}
      {error ? (
        <p className="text-sm text-amber-200" role="alert">
          {error}
        </p>
      ) : null}
      {!forecast && !loading && !error && draft.proposed ? (
        <p className="text-sm text-zinc-400">Player counts appear here after the forecast loads. Birthdate windows are ready now.</p>
      ) : null}
      {forecast ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm" data-testid="builder-counts-table">
              <caption className="sr-only">Player and team counts for the division builder table. Counts only.</caption>
              <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">Division</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Players in window</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Expected</th>
                  <th scope="col" className="py-2 font-semibold">Teams</th>
                </tr>
              </thead>
              <tbody>
                {views.map((view) => {
                  const row = byCode.get(view.code);
                  return (
                    <tr key={view.row.id} className="border-t border-zinc-800 text-zinc-200">
                      <td className="py-2 pr-3">{view.title}</td>
                      <td className="py-2 pr-3 tabular-nums">{row ? row.proposed.pool : "—"}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row ? row.proposed.expected : "—"}
                        {overlapIds.has(view.row.id) ? (
                          <span className="mt-1 block text-xs text-amber-100">Also fits another division</span>
                        ) : null}
                        {row?.proposedShortRoster ? (
                          <span className="mt-1 block text-xs text-amber-100">Short of a full team</span>
                        ) : null}
                      </td>
                      <td className="py-2 tabular-nums">
                        {row ? formatTeamRange(row.proposed.minTeams, row.proposed.maxTeams) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="space-y-1 text-sm text-zinc-300">
            <li>
              League total, each player once: {forecast.league.proposed.expected} expected, teams{" "}
              {formatTeamRange(forecast.league.proposed.minTeams, forecast.league.proposed.maxTeams)}.
            </li>
            <li>Players counted once: {populationTotal(forecast.proposed.distinctTotal)}.</li>
            <li>
              Too young for every division: {forecast.proposed.tooYoung.total}. Aged out: {forecast.proposed.agedOut.total}.
              Between divisions: {betweenDivisionCount(forecast.proposed.unmatched, forecast.includeFeeder)}.
            </li>
            <li>
              Data source: {dataSourceLabel(forecast.source)}. Birthdate coverage:{" "}
              {coverageLabel(forecast.coveragePct, forecast.sources.own.datedPlayers, forecast.sources.own.players)}.
            </li>
          </ul>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-zinc-200">How to read the counts</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">
              {FORECAST_CAVEATS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
      {draft.proposed ? (
        <div data-testid="builder-timeline" className="space-y-6">
          {leagueTimelines.map((league) => {
            if (!league.draft.proposed) return null;
            return (
              <div key={league.id}>
                <h4 className="mb-2 text-sm font-semibold text-white">{league.label} birthdate windows</h4>
                <DivisionAgesForecastTimeline
                  readOnly
                  proposed={league.draft.proposed}
                  baseline={null}
                  targetSeason={table.seasonYear}
                  linkEdges={false}
                  counts={counts}
                  countsLoading={loading}
                  onDivisions={() => {}}
                  onCutoff={() => {}}
                  onReplace={() => {}}
                  onLinkEdges={() => {}}
                  onReset={() => {}}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
