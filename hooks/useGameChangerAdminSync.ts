"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BracketLiveGameStatus } from "@/components/brackets/TournamentBracketView";
import type { GcAdminLiveResponse, GcScoreboardEvent } from "@/lib/gamechanger/types";

type AdminSyncResponse = GcAdminLiveResponse & { error?: string };

export function useGameChangerAdminSync(
  projectId: string | null | undefined,
  enabled: boolean,
  onSpecUpdated?: () => void,
) {
  const [liveGameStatuses, setLiveGameStatuses] = useState<Record<string, BracketLiveGameStatus> | null>(
    null,
  );
  const [matchEventIds, setMatchEventIds] = useState<Record<string, string>>({});
  const [eventsByMatchId, setEventsByMatchId] = useState<Record<string, GcScoreboardEvent>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastImportedMatchIds, setLastImportedMatchIds] = useState<string[]>([]);
  const pollMsRef = useRef(30_000);
  const hasLoadedRef = useRef(false);

  const applyPayload = useCallback(
    (json: AdminSyncResponse) => {
      setLiveGameStatuses(json.liveGameStatuses ?? {});
      setMatchEventIds(json.matchEventIds ?? {});
      setEventsByMatchId(json.eventsByMatchId ?? {});
      pollMsRef.current = json.nextPollMs ?? 30_000;
      if (json.importedMatchIds?.length) {
        setLastImportedMatchIds(json.importedMatchIds);
        if (json.specUpdated) onSpecUpdated?.();
      }
    },
    [onSpecUpdated],
  );

  const fetchSync = useCallback(
    async (method: "GET" | "POST" = "GET") => {
      if (!projectId || !enabled) return;
      if (!hasLoadedRef.current) setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/tournament-brackets/projects/${encodeURIComponent(projectId)}/gamechanger-sync`,
          { method, cache: "no-store" },
        );
        const json = (await res.json()) as AdminSyncResponse;
        if (!res.ok) throw new Error(json.error ?? `GameChanger sync failed (${res.status})`);
        applyPayload(json);
        hasLoadedRef.current = true;
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [projectId, enabled, applyPayload],
  );

  const importCompleted = useCallback(async (): Promise<string[]> => {
    if (!projectId || !enabled) return [];
    const res = await fetch(
      `/api/admin/tournament-brackets/projects/${encodeURIComponent(projectId)}/gamechanger-sync`,
      { method: "POST", cache: "no-store" },
    );
    const json = (await res.json()) as AdminSyncResponse;
    if (!res.ok) throw new Error(json.error ?? `GameChanger import failed (${res.status})`);
    applyPayload(json);
    hasLoadedRef.current = true;
    setError(null);
    return json.importedMatchIds ?? [];
  }, [projectId, enabled, applyPayload]);

  useEffect(() => {
    if (!projectId || !enabled) {
      setLiveGameStatuses(null);
      setMatchEventIds({});
      setEventsByMatchId({});
      setError(null);
      hasLoadedRef.current = false;
      return;
    }

    let cancelled = false;
    let timeoutId = 0;

    const tick = async () => {
      if (cancelled) return;
      await fetchSync("GET");
      if (cancelled) return;
      timeoutId = window.setTimeout(() => {
        void tick();
      }, pollMsRef.current);
    };

    void tick();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [projectId, enabled, fetchSync]);

  return {
    liveGameStatuses,
    matchEventIds,
    eventsByMatchId,
    loading,
    error,
    lastImportedMatchIds,
    importCompleted,
    refresh: () => fetchSync("GET"),
  };
}
