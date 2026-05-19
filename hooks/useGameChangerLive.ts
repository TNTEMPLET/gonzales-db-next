"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BracketLiveGameStatus } from "@/components/brackets/TournamentBracketView";
import type { GcLiveMatchPayload } from "@/lib/gamechanger/types";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollMsRef = useRef(30_000);
  const hasLoadedRef = useRef(false);

  const fetchLive = useCallback(async () => {
    if (!projectId || !enabled) return;
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
      pollMsRef.current = json.nextPollMs ?? 30_000;
      hasLoadedRef.current = true;
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    if (!projectId || !enabled) {
      setLiveGameStatuses(null);
      setMatchEventIds({});
      setError(null);
      hasLoadedRef.current = false;
      return;
    }

    let cancelled = false;
    let timeoutId = 0;

    const tick = async () => {
      if (cancelled) return;
      await fetchLive();
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
  }, [projectId, enabled, fetchLive]);

  return {
    liveGameStatuses,
    matchEventIds,
    loading,
    error,
    refresh: fetchLive,
  };
}
