"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  specPatchFromTeamRenames,
  teamLabelRenamesFromDraft,
} from "@/lib/tournament-brackets/bracketTeamRename";

export type TeamNameSourcesPayload = {
  bracketLabels: string[];
  gameChangerTeamNames: string[];
  rosterTeamNames: string[];
  candidateNames: string[];
  suggestedMappings: { from: string; to: string }[];
  gameChangerConfigured: boolean;
  gameChangerError?: string;
  rosterAgeGroup?: string;
};

type Props = {
  spec: BracketSpec;
  projectId: string;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  sources?: TeamNameSourcesPayload | null;
  sourcesLoading?: boolean;
  sourcesError?: string | null;
  onReloadSources?: () => void;
  draftByOriginal?: Record<string, string>;
  onDraftChange?: (draft: Record<string, string>) => void;
};

const CUSTOM_SELECT_VALUE = "__custom__";

function draftFromSources(sources: TeamNameSourcesPayload): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const label of sources.bracketLabels) {
    draft[label] = label;
  }
  for (const { from, to } of sources.suggestedMappings) {
    if (draft[from] !== undefined) draft[from] = to;
  }
  return draft;
}

function TeamNameReferenceList({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <ul className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
        {names.map((name) => (
          <li
            key={name}
            className="rounded border border-zinc-700/80 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200"
            title={name}
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BracketTeamNameMappingEditor({
  spec,
  projectId,
  busy,
  onSave,
  sources: sourcesProp,
  sourcesLoading: sourcesLoadingProp,
  sourcesError: sourcesErrorProp,
  onReloadSources,
  draftByOriginal: controlledDraft,
  onDraftChange,
}: Props) {
  const [localSources, setLocalSources] = useState<TeamNameSourcesPayload | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [internalDraft, setInternalDraft] = useState<Record<string, string>>({});
  const [customEditing, setCustomEditing] = useState<Record<string, boolean>>({});
  const initializedProjectRef = useRef<string | null>(null);

  const isControlled = controlledDraft != null && onDraftChange != null;
  const draftByOriginal = controlledDraft ?? internalDraft;

  const setDraftByOriginal = useCallback(
    (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
      if (isControlled && onDraftChange) {
        const next = typeof updater === "function" ? updater(controlledDraft) : updater;
        onDraftChange(next);
      } else {
        setInternalDraft(updater);
      }
    },
    [isControlled, onDraftChange, controlledDraft],
  );

  const sources = sourcesProp ?? localSources;
  const sourcesLoading = sourcesLoadingProp ?? localLoading;
  const sourcesError = sourcesErrorProp ?? localError;

  const loadSources = useCallback(async () => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      const res = await fetch(
        `/api/admin/tournament-brackets/projects/${encodeURIComponent(projectId)}/team-name-sources`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as TeamNameSourcesPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed to load team sources (${res.status})`);
      setLocalSources(json);
      if (!isControlled) setInternalDraft(draftFromSources(json));
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : String(err));
      setLocalSources(null);
    } finally {
      setLocalLoading(false);
    }
  }, [projectId, isControlled]);

  useEffect(() => {
    if (sourcesProp != null) return;
    void loadSources();
  }, [projectId, sourcesProp, loadSources]);

  useEffect(() => {
    if (!sources) return;
    const initKey = `${projectId}:${sources.bracketLabels.join("|")}`;
    if (initializedProjectRef.current === initKey) return;
    initializedProjectRef.current = initKey;
    if (!isControlled) {
      setInternalDraft(draftFromSources(sources));
    }
  }, [projectId, sources, isControlled]);

  const originals = useMemo(() => sources?.bracketLabels ?? [], [sources]);
  const gcNames = useMemo(() => sources?.gameChangerTeamNames ?? [], [sources]);
  const rosterNames = useMemo(() => sources?.rosterTeamNames ?? [], [sources]);
  const selectOptions = useMemo(() => {
    const seen = new Set<string>();
    const add = (name: string, list: string[]) => {
      const trimmed = name.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      list.push(trimmed);
    };
    const gc: string[] = [];
    const roster: string[] = [];
    for (const n of gcNames) add(n, gc);
    for (const n of rosterNames) add(n, roster);
    return { gc, roster, all: [...gc, ...roster] };
  }, [gcNames, rosterNames]);

  const pendingRenames = teamLabelRenamesFromDraft(originals, draftByOriginal);
  const hasChanges = pendingRenames.length > 0;

  function applyAllSuggestions() {
    if (!sources) return;
    setDraftByOriginal(draftFromSources(sources));
    setCustomEditing({});
  }

  function keepBracketNames() {
    const next: Record<string, string> = {};
    for (const label of originals) next[label] = label;
    setDraftByOriginal(next);
    setCustomEditing({});
  }

  function setMappedName(original: string, nextValue: string) {
    setDraftByOriginal((prev) => ({ ...prev, [original]: nextValue }));
  }

  function isCustomValue(original: string, value: string): boolean {
    if (value.trim() === original.trim()) return false;
    return !selectOptions.all.some((n) => n === value.trim());
  }

  async function handleSave() {
    if (!hasChanges) return;
    const patch = specPatchFromTeamRenames(spec, pendingRenames);
    await onSave(patch);
  }

  if (sourcesLoading && !sources) {
    return <p className="text-xs text-zinc-500">Loading bracket and GameChanger team names…</p>;
  }

  if (sourcesError && !sources) {
    return (
      <p className="text-xs text-amber-300">
        {sourcesError}{" "}
        <button type="button" className="underline" onClick={() => (onReloadSources ? onReloadSources() : void loadSources())}>
          Retry
        </button>
      </p>
    );
  }

  if (!sources || originals.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        No team names on this bracket yet. Add teams in bracket structure first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-500">
        Map each bracket name to the matching GameChanger or roster label. Pick from the dropdown lists below;
        use Custom only if the name is not listed.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <TeamNameReferenceList title={`GameChanger teams (${gcNames.length})`} names={gcNames} />
        {sources.rosterAgeGroup ? (
          <TeamNameReferenceList
            title={`Roster ${sources.rosterAgeGroup} (${rosterNames.length})`}
            names={rosterNames}
          />
        ) : null}
      </div>

      {sources.gameChangerConfigured && gcNames.length === 0 && !sources.gameChangerError ? (
        <p className="text-xs text-zinc-500">
          GameChanger is configured but returned no team names for the current scoreboard window. Try Refresh
          names after games are scheduled.
        </p>
      ) : null}

      {sources.gameChangerError ? (
        <p className="text-xs text-amber-300">GameChanger: {sources.gameChangerError}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || sources.suggestedMappings.length === 0}
          className="rounded border border-violet-700/60 bg-violet-950/40 px-2 py-1 text-[11px] font-semibold text-violet-100 hover:bg-violet-900/50 disabled:opacity-40"
          onClick={applyAllSuggestions}
        >
          Apply all suggestions ({sources.suggestedMappings.length})
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
          onClick={keepBracketNames}
        >
          Reset to bracket names
        </button>
        {onReloadSources || !sourcesProp ? (
          <button
            type="button"
            disabled={busy || sourcesLoading}
            className="rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
            onClick={() => (onReloadSources ? onReloadSources() : void loadSources())}
          >
            Refresh names
          </button>
        ) : null}
      </div>

      <ul className="space-y-2">
        {originals.map((original) => {
          const value = draftByOriginal[original] ?? original;
          const changed = value.trim() !== original.trim();
          const useCustom = customEditing[original] || isCustomValue(original, value);
          const selectValue = useCustom ? CUSTOM_SELECT_VALUE : value;

          return (
            <li
              key={original}
              className="grid gap-2 rounded-lg border border-zinc-700/80 bg-zinc-950/50 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-start"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">On bracket</p>
                <p className="truncate text-sm text-zinc-300" title={original}>
                  {original}
                </p>
              </div>
              <div className="min-w-0 space-y-1">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Map to {changed ? "(changed)" : ""}
                  </span>
                  <select
                    className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm"
                    value={selectValue}
                    disabled={busy}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === CUSTOM_SELECT_VALUE) {
                        setCustomEditing((prev) => ({ ...prev, [original]: true }));
                        return;
                      }
                      setCustomEditing((prev) => {
                        const copy = { ...prev };
                        delete copy[original];
                        return copy;
                      });
                      setMappedName(original, next);
                    }}
                    aria-label={`Map ${original} to`}
                  >
                    <option value={original}>Keep bracket name</option>
                    {selectOptions.gc.length > 0 ? (
                      <optgroup label="GameChanger">
                        {selectOptions.gc.map((name) => (
                          <option key={`gc-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {selectOptions.roster.length > 0 ? (
                      <optgroup label="League roster">
                        {selectOptions.roster.map((name) => (
                          <option key={`roster-${name}`} value={name}>
                            {name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    <option value={CUSTOM_SELECT_VALUE}>Custom name…</option>
                  </select>
                </label>
                {useCustom ? (
                  <input
                    className="w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm"
                    value={value}
                    disabled={busy}
                    placeholder="Type exact name"
                    onChange={(e) => setMappedName(original, e.target.value)}
                    aria-label={`Custom name for ${original}`}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={busy || !hasChanges}
        onClick={() => void handleSave()}
        className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-40"
      >
        Save team name{pendingRenames.length === 1 ? "" : "s"}
        {hasChanges ? ` (${pendingRenames.length})` : ""}
      </button>
    </div>
  );
}
