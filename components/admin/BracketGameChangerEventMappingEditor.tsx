"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import type {
  BracketMatchMappingRow,
  GameChangerEventMappingSources,
} from "@/lib/gamechanger/eventMappingSources";

const AUTO_VALUE = "";

type Props = {
  spec: BracketSpec;
  projectId: string;
  busy: boolean;
  onSave: (matchEventPins: Record<string, string | null>) => Promise<void>;
};

function draftFromSources(sources: GameChangerEventMappingSources): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const row of sources.bracketMatches) {
    draft[row.matchId] = row.pinnedEventId ?? AUTO_VALUE;
  }
  return draft;
}

function pinsPayloadFromDraft(
  rows: BracketMatchMappingRow[],
  draft: Record<string, string>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const row of rows) {
    const value = (draft[row.matchId] ?? AUTO_VALUE).trim();
    if (value === AUTO_VALUE) {
      if (row.pinnedEventId) out[row.matchId] = null;
    } else {
      out[row.matchId] = value;
    }
  }
  return out;
}

export default function BracketGameChangerEventMappingEditor({ spec, projectId, busy, onSave }: Props) {
  const [sources, setSources] = useState<GameChangerEventMappingSources | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftByMatchId, setDraftByMatchId] = useState<Record<string, string>>({});

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/tournament-brackets/projects/${encodeURIComponent(projectId)}/gamechanger-event-mapping`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as GameChangerEventMappingSources & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed to load event mapping (${res.status})`);
      setSources(json);
      setDraftByMatchId(draftFromSources(json));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSources(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const rows = useMemo(() => sources?.bracketMatches ?? [], [sources]);
  const events = useMemo(() => sources?.gameChangerEvents ?? [], [sources]);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const hasChanges = useMemo(() => {
    if (!sources) return false;
    for (const row of rows) {
      const draft = (draftByMatchId[row.matchId] ?? AUTO_VALUE).trim();
      const pinned = row.pinnedEventId ?? AUTO_VALUE;
      if (draft !== pinned) return true;
    }
    return false;
  }, [sources, rows, draftByMatchId]);

  function applyAllSuggestions() {
    if (!sources) return;
    const next: Record<string, string> = {};
    for (const row of sources.bracketMatches) {
      next[row.matchId] = row.suggestedEventId ?? AUTO_VALUE;
    }
    setDraftByMatchId(next);
  }

  function clearAllPins() {
    const next: Record<string, string> = {};
    for (const row of rows) next[row.matchId] = AUTO_VALUE;
    setDraftByMatchId(next);
  }

  async function handleSave() {
    if (!sources || !hasChanges) return;
    await onSave(pinsPayloadFromDraft(rows, draftByMatchId));
    await loadSources();
  }

  if (!spec.gameChanger?.widgetId) {
    return (
      <p className="text-xs text-zinc-500">
        Save a GameChanger widget ID under Bracket preview → Preview settings first, then pin each bracket
        game to the correct GameChanger event.
      </p>
    );
  }

  if (loading && !sources) {
    return <p className="text-xs text-zinc-500">Loading bracket games and GameChanger events…</p>;
  }

  if (error && !sources) {
    return (
      <p className="text-xs text-amber-300">
        {error}{" "}
        <button type="button" className="underline" onClick={() => void loadSources()}>
          Retry
        </button>
      </p>
    );
  }

  if (!sources || rows.length === 0) {
    return <p className="text-xs text-zinc-500">No scheduled bracket games to map yet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-500">
        Pin each bracket game to a specific GameChanger event UUID when team-name matching picks the wrong
        game (rematches, similar names). Auto uses the same matcher as live scores; pins override it.
      </p>

      {sources.gameChangerError ? (
        <p className="text-xs text-amber-300">GameChanger: {sources.gameChangerError}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || rows.every((r) => !r.suggestedEventId)}
          className="rounded border border-violet-700/60 bg-violet-950/40 px-2 py-1 text-[11px] font-semibold text-violet-100 hover:bg-violet-900/50 disabled:opacity-40"
          onClick={applyAllSuggestions}
        >
          Apply auto-match to all
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
          onClick={clearAllPins}
        >
          Clear all pins
        </button>
        <button
          type="button"
          disabled={busy || loading}
          className="rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          onClick={() => void loadSources()}
        >
          Refresh events
        </button>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const draftValue = draftByMatchId[row.matchId] ?? AUTO_VALUE;
          const isPinned = draftValue.trim() !== AUTO_VALUE;
          const changed = draftValue !== (row.pinnedEventId ?? AUTO_VALUE);
          const suggested = row.suggestedEventId
            ? eventsById.get(row.suggestedEventId)?.label ?? row.suggestedEventId
            : null;
          const pinnedMissing = isPinned && row.pinMissingFromWindow;
          const orphanPinLabel = pinnedMissing && isPinned ? draftValue.slice(0, 8) + "…" : null;

          return (
            <li
              key={row.matchId}
              className="grid gap-2 rounded-lg border border-zinc-700/80 bg-zinc-950/50 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-start"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Bracket game</p>
                <p className="text-sm text-zinc-200" title={row.label}>
                  {row.label}
                </p>
                {row.scheduleLabel ? (
                  <p className="text-[11px] text-zinc-500">{row.scheduleLabel}</p>
                ) : null}
                {suggested ? (
                  <p className="mt-1 text-[10px] text-zinc-500" title={suggested}>
                    Auto: {suggested.length > 72 ? `${suggested.slice(0, 72)}…` : suggested}
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-zinc-600">Auto: no match in scoreboard window</p>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    GameChanger event {changed ? "(unsaved)" : isPinned ? "(pinned)" : ""}
                  </span>
                  <select
                    className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm"
                    value={draftValue}
                    disabled={busy || events.length === 0}
                    onChange={(e) =>
                      setDraftByMatchId((prev) => ({ ...prev, [row.matchId]: e.target.value }))
                    }
                    aria-label={`GameChanger event for ${row.label}`}
                  >
                    <option value={AUTO_VALUE}>Auto (team names + schedule)</option>
                    {orphanPinLabel ? (
                      <option value={draftValue}>
                        Pinned (not in window): {orphanPinLabel}
                      </option>
                    ) : null}
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.label}
                      </option>
                    ))}
                  </select>
                </label>
                {pinnedMissing ? (
                  <p className="text-[10px] text-amber-300">
                    Pinned event is outside the 5-day scoreboard window — live scores may not show until it
                    reappears. Refresh after the game is near today.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled={busy || !hasChanges}
        className="min-h-10 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-40"
        onClick={() => void handleSave()}
      >
        Save event pins
      </button>
    </div>
  );
}
