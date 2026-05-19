"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BracketLiveGameStatus } from "@/components/brackets/TournamentBracketView";
import { scheduleNextGcPoll } from "@/hooks/gameChangerPollLoop";
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
  const pollStateRef = useRef({
    hadLiveGames: false,
    postLiveFollowUpPending: false,
  });
  const hasLoadedRef = useRef(false);
  const pollingRef = useRef(false);
  const onSpecUpdatedRef = useRef(onSpecUpdated);
  onSpecUpdatedRef.current = onSpecUpdated;

  const applyPayload = useCallback((json: AdminSyncResponse): number | null => {
    setLiveGameStatuses(json.liveGameStatuses ?? {});
    setMatchEventIds(json.matchEventIds ?? {});
    setEventsByMatchId(json.eventsByMatchId ?? {});
    if (json.importedMatchIds?.length) {
      setLastImportedMatchIds(json.importedMatchIds);
      if (json.specUpdated) onSpecUpdatedRef.current?.();
    }
    const schedule = scheduleNextGcPoll({
      hasLiveGames: json.hasLiveGames ?? false,
      nextPollMs: json.nextPollMs ?? 30_000,
      hadLiveGames: pollStateRef.current.hadLiveGames,
      postLiveFollowUpPending: pollStateRef.current.postLiveFollowUpPending,
    });
    pollStateRef.current.hadLiveGames = schedule.hadLiveGames;
    pollStateRef.current.postLiveFollowUpPending = schedule.postLiveFollowUpPending;
    return schedule.delayMs;
  }, []);

  const fetchSync = useCallback(
    async (method: "GET" | "POST" = "GET"): Promise<number | null> => {
      if (!projectId || !enabled) return null;
      if (!hasLoadedRef.current) setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/tournament-brackets/projects/${encodeURIComponent(projectId)}/gamechanger-sync`,
          { method, cache: "no-store" },
        );
        const json = (await res.json()) as AdminSyncResponse;
        if (!res.ok) throw new Error(json.error ?? `GameChanger sync failed (${res.status})`);
        hasLoadedRef.current = true;
        setError(null);
        return applyPayload(json);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [projectId, enabled, applyPayload],
  );

  const fetchSyncRef = useRef(fetchSync);
  fetchSyncRef.current = fetchSync;

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
    }
  }, [projectId, enabled]);

  useEffect(() => {
    if (!projectId || !enabled) {
      hasLoadedRef.current = false;
      pollStateRef.current = { hadLiveGames: false, postLiveFollowUpPending: false };
      pollingRef.current = false;
      return;
    }

    let cancelled = false;
    let timeoutId = 0;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timeoutId = window.setTimeout(() => {
        void runPollLoop();
      }, delayMs);
    };

    const runPollLoop = async () => {
      if (cancelled) return;
      pollingRef.current = true;
      const delayMs = await fetchSyncRef.current("GET");
      if (cancelled) return;
      if (delayMs != null) {
        schedule(delayMs);
      } else {
        pollingRef.current = false;
      }
    };

    const onVisibility = () => {
      if (cancelled || document.visibilityState !== "visible" || pollingRef.current) return;
      void runPollLoop();
    };

    void runPollLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      pollingRef.current = false;
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [projectId, enabled]);

  return {
    liveGameStatuses,
    matchEventIds,
    eventsByMatchId,
    loading,
    error,
    lastImportedMatchIds,
    importCompleted,
    refresh: () => fetchSyncRef.current("GET"),
  };
}
