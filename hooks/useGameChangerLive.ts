"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BracketLiveGameStatus } from "@/components/brackets/TournamentBracketView";
import { scheduleNextGcPoll } from "@/hooks/gameChangerPollLoop";
import type { GcLiveMatchPayload, GcScoreboardEvent, GcLiveSituation } from "@/lib/gamechanger/types";

type LiveApiResponse = GcLiveMatchPayload & {
  organizationName?: string;
  polledAt?: string;
  error?: string;
};

export function useGameChangerLive(projectId: string | null | undefined, enabled: boolean) {
  const [liveGameStatuses, setLiveGameStatuses] = useState<Record<string, BracketLiveGameStatus> | null>(
    null,
  );
  const [matchEventIds, setMatchEventIds] = useState<Record<string, string>>({});
  const [eventsByMatchId, setEventsByMatchId] = useState<Record<string, GcScoreboardEvent>>({});
  const [liveSituationsByMatchId, setLiveSituationsByMatchId] = useState<Record<string, GcLiveSituation>>({});
  const [organizationId, setOrganizationId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollStateRef = useRef({
    hadLiveGames: false,
    postLiveFollowUpPending: false,
  });
  const hasLoadedRef = useRef(false);
  const pollingRef = useRef(false);

  const fetchLive = useCallback(async (): Promise<number | null> => {
    if (!projectId || !enabled) return null;
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${encodeURIComponent(projectId)}/gamechanger-live`, {
        cache: "no-store",
      });
      const json = (await res.json()) as LiveApiResponse;
      if (!res.ok) {
        throw new Error(json.error ?? `Live scores unavailable (${res.status})`);
      }
      setLiveGameStatuses(json.liveGameStatuses ?? {});
      setMatchEventIds(json.matchEventIds ?? {});
      setEventsByMatchId(json.eventsByMatchId ?? {});
      setLiveSituationsByMatchId(json.liveSituationsByMatchId ?? {});
      setOrganizationId(json.organizationId);
      const schedule = scheduleNextGcPoll({
        hasLiveGames: json.hasLiveGames ?? false,
        nextPollMs: json.nextPollMs ?? 30_000,
        hadLiveGames: pollStateRef.current.hadLiveGames,
        postLiveFollowUpPending: pollStateRef.current.postLiveFollowUpPending,
      });
      pollStateRef.current.hadLiveGames = schedule.hadLiveGames;
      pollStateRef.current.postLiveFollowUpPending = schedule.postLiveFollowUpPending;
      hasLoadedRef.current = true;
      setError(null);
      return schedule.delayMs;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectId, enabled]);

  const fetchLiveRef = useRef(fetchLive);
  fetchLiveRef.current = fetchLive;

  useEffect(() => {
    if (!projectId || !enabled) {
      setLiveGameStatuses(null);
      setMatchEventIds({});
      setEventsByMatchId({});
      setLiveSituationsByMatchId({});
      setOrganizationId(undefined);
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
      const delayMs = await fetchLiveRef.current();
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
    liveSituationsByMatchId,
    organizationId,
    loading,
    error,
    refresh: () => fetchLiveRef.current(),
  };
}
