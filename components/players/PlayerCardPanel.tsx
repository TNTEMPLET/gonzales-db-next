"use client";

import {
  READINESS_LABELS,
  type PlayerCardView,
  type PlayerReadiness,
} from "@/lib/players/types";

export { playerCardFromFields } from "@/lib/players/playerCardFromFields";

const READINESS_STYLES: Record<PlayerReadiness, string> = {
  READY: "border-emerald-600/70 bg-emerald-950/50 text-emerald-100",
  INCOMPLETE: "border-amber-600/70 bg-amber-950/40 text-amber-100",
  BLOCKED: "border-red-600/70 bg-red-950/50 text-red-100",
};

/**
 * Compact Player Card readiness panel for admin/coach drawers.
 */
export default function PlayerCardPanel({
  card,
  compact = false,
}: {
  card: PlayerCardView;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"
          : "space-y-4 rounded-2xl border border-zinc-700 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-4"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-gold">
            Player card
          </p>
          {!compact ? (
            <>
              <h4 className="mt-0.5 text-lg font-bold text-white">{card.fullName}</h4>
              <p className="text-xs text-zinc-400">
                {card.team.ageGroup} {card.team.teamName} · Season {card.seasonYear}
                {card.jerseyNumber ? ` · #${card.jerseyNumber}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-zinc-300">
              Score: {card.completeCount}/{card.totalRequired}
            </p>
          )}
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${READINESS_STYLES[card.readiness]}`}
        >
          {READINESS_LABELS[card.readiness]}
        </span>
      </div>

      <ul className="space-y-1.5">
        {card.checks.map((check) => (
          <li
            key={check.key}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-2.5 py-1.5 text-sm"
          >
            <span className="text-zinc-200">{check.label}</span>
            <span
              className={
                check.ok
                  ? "text-[11px] font-semibold uppercase text-emerald-300"
                  : "text-[11px] font-semibold uppercase text-amber-300"
              }
            >
              {check.ok ? "OK" : "Missing"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
