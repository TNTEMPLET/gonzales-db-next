"use client";

import { useMemo, useState } from "react";

import PlayerCardPanel from "@/components/players/PlayerCardPanel";
import {
  buildDemoPlayerCard,
  type DemoPlayerVariant,
} from "@/lib/players/demoCards";

export default function SamplePlayerCardClient({
  organizationId,
  seasonYear,
}: {
  organizationId: string;
  seasonYear: number;
}) {
  const [variant, setVariant] = useState<DemoPlayerVariant>("ready");

  const card = useMemo(
    () => buildDemoPlayerCard(variant, { organizationId, seasonYear }),
    [variant, organizationId, seasonYear],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["ready", "Ready"],
            ["incomplete", "Incomplete"],
            ["blocked", "Blocked"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setVariant(key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              variant === key
                ? "border-brand-purple bg-brand-purple/30 text-white"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <PlayerCardPanel card={card} />

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          How it appears in the roster table
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-200">
          <span className="font-medium">{card.fullName}</span>
          <span className="text-zinc-500">#{card.jerseyNumber || "—"}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              card.readiness === "READY"
                ? "border-emerald-700 bg-emerald-950/50 text-emerald-300"
                : card.readiness === "BLOCKED"
                  ? "border-red-700 bg-red-950/50 text-red-300"
                  : "border-amber-700 bg-amber-950/50 text-amber-300"
            }`}
          >
            🏅 {card.completeCount}/{card.totalRequired}
          </span>
        </div>
      </div>
    </div>
  );
}
