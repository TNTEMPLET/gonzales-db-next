"use client";

import { useEffect, useMemo, useState } from "react";

import { SpringCombinedSavePanel } from "@/components/admin/SpringCombinedSavePanel";
import { proposedFromBuilder } from "@/lib/admin/springCombined/builderSave";
import type { SpringLeagueTable } from "@/lib/admin/springCombined/save";
import { SPRING_LEAGUE_ORGS } from "@/lib/admin/springCombined/view";
import type { BuilderTable } from "@/lib/ageDivisions/divisionBuilder";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; leagues: SpringLeagueTable[] };

type SeasonPayload = {
  error?: string;
  cutoff?: LeagueAgeRule;
  divisions?: DivisionAgeConfig[];
  undoAvailable?: boolean;
  baselineToken?: string;
};

export function BuilderSpringSave({ table }: { table: BuilderTable }) {
  const [loaded, setLoaded] = useState<LoadState>({ status: "loading" });
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded({ status: "loading" });
    setNote(null);
    async function load() {
      try {
        const leagues = await Promise.all(
          SPRING_LEAGUE_ORGS.map(async (org) => {
            const response = await fetch(
              `/api/admin/division-ages/season?org=${encodeURIComponent(org)}&seasonYear=${table.seasonYear}`,
              { cache: "no-store" },
            );
            const payload = (await response.json().catch(() => null)) as SeasonPayload | null;
            if (!response.ok || !payload?.cutoff || !Array.isArray(payload.divisions)) {
              throw new Error(payload?.error || "Could not load saved division ages.");
            }
            const league: SpringLeagueTable = {
              organizationId: org,
              cutoff: payload.cutoff,
              divisions: payload.divisions,
              undoAvailable: payload.undoAvailable === true,
              baselineToken: typeof payload.baselineToken === "string" ? payload.baselineToken : undefined,
            };
            return league;
          }),
        );
        if (!cancelled) setLoaded({ status: "ready", leagues });
      } catch (caught) {
        if (!cancelled) {
          setLoaded({
            status: "error",
            message: caught instanceof Error ? caught.message : "Could not load saved division ages.",
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [table.seasonYear]);

  const proposed = useMemo(() => {
    if (loaded.status !== "ready") return null;
    return proposedFromBuilder(table, loaded.leagues);
  }, [loaded, table]);

  if (loaded.status === "loading") {
    return <p className="text-sm text-zinc-300">Loading saved divisions…</p>;
  }
  if (loaded.status === "error") {
    return (
      <p className="text-sm text-amber-200" role="alert">
        {loaded.message}
      </p>
    );
  }
  if (!proposed?.ok) {
    return (
      <p className="text-sm text-amber-200" role="alert">
        {proposed?.error ?? "This table cannot be saved yet."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {note ? (
        <p className="text-sm text-emerald-100" role="status">
          {note}
        </p>
      ) : null}
      <SpringCombinedSavePanel
        seasonYear={table.seasonYear}
        proposed={proposed.proposed}
        leagues={loaded.leagues}
        onSaved={setNote}
      />
    </div>
  );
}
