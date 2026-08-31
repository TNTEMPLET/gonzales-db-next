"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/draft/clientError";
import { formatCentralDateTime } from "@/lib/draft/centralTime";

type SessionListItem = {
  id: string;
  name: string;
  ageGroup: string;
  seasonYear: number;
  status: string;
  draftType: string;
  totalRounds: number;
  scheduledStartAt: string | null;
  _count: { playerPool: number; picks: number };
  teams: { id: string; teamName: string; draftOrder: number; headCoach: { name: string | null } | null }[];
  myTeamId: string | null;
  myTeamName: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  SETUP: "Upcoming",
  PAIRED: "Not started yet",
  LIVE: "Live now",
  PAUSED: "Paused",
  COMPLETED: "Picks complete",
  MATERIALIZED: "Finalized",
};

const STATUS_CLASS: Record<string, string> = {
  SETUP: "bg-zinc-800 text-zinc-300",
  PAIRED: "bg-zinc-800 text-zinc-300",
  LIVE: "bg-emerald-500/20 text-emerald-400 animate-pulse",
  PAUSED: "bg-amber-500/20 text-amber-400",
  COMPLETED: "bg-sky-500/20 text-sky-400",
  MATERIALIZED: "bg-zinc-700 text-zinc-300",
};

const UPCOMING_STATUSES = new Set(["SETUP", "PAIRED", "PAUSED"]);

export default function CoachDraftSessionList({ orgQuery }: { orgQuery: string }) {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/coach-corner/draft/sessions?${orgQuery}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to load drafts");
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setSessions(json.sessions);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [orgQuery]);

  if (error) {
    return <div className="rounded-lg border border-red-700 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>;
  }

  if (!sessions) {
    return <div className="text-sm text-zinc-400">Loading drafts...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-sm text-zinc-400">
        No live drafts yet. Your league admin will share this page once a draft is set up and ready to go.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sessions.map((session) => (
        <Link
          key={session.id}
          href={`/coach-corner/draft/${session.id}?${orgQuery}`}
          className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 hover:border-emerald-500/50 hover:bg-zinc-900 transition-colors space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-white text-sm">{session.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLASS[session.status] || "bg-zinc-800 text-zinc-300"}`}>
              {STATUS_LABEL[session.status] || session.status}
            </span>
          </div>
          <div className="text-xs text-zinc-400">
            {session.ageGroup} · {session.teams.length} Teams · {session._count.picks} / {session.teams.length * session.totalRounds} picks
          </div>
          {session.scheduledStartAt && UPCOMING_STATUSES.has(session.status) && (
            <div className="text-[11px] text-amber-400 font-semibold">
              🕐 Starts {formatCentralDateTime(session.scheduledStartAt)}
            </div>
          )}
          {session.myTeamName ? (
            <div className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 text-[11px] text-emerald-400 font-semibold">
              🛡️ Your team: {session.myTeamName}
            </div>
          ) : (
            <div className="text-[11px] text-zinc-500 italic">Spectator view</div>
          )}
        </Link>
      ))}
    </div>
  );
}
