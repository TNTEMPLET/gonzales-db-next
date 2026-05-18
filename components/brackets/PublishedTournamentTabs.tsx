"use client";

import { useMemo, useState } from "react";

import TournamentBracketView from "@/components/brackets/TournamentBracketView";
import type { BracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import type { BracketParkInfo } from "@/lib/tournament-brackets/bracketSpec";
import type { BracketThemeColors } from "@/lib/tournament-brackets/bracketTheme";

export type PublishedTournamentTabBracket = {
  id: string;
  name: string;
  seasonYear: number;
  updatedAtLabel: string;
  layout: BracketLayout;
  parkInfo?: BracketParkInfo | null;
  themeColors: BracketThemeColors;
};

type TournamentBranding = {
  targetLogoPath: string;
  parentLogoPath: string;
  parentName: string;
};

type Props = {
  brackets: PublishedTournamentTabBracket[];
  branding: TournamentBranding;
  initialSelectedBracketId?: string | null;
};

const BRACKET_QUERY_PARAM = "bracket";

function getInitialBracketId(brackets: PublishedTournamentTabBracket[], requestedId?: string | null) {
  if (requestedId && brackets.some((bracket) => bracket.id === requestedId)) return requestedId;
  return brackets[0]?.id ?? "";
}

function getSelectedBracket(
  brackets: PublishedTournamentTabBracket[],
  selectedBracketId: string,
): PublishedTournamentTabBracket | undefined {
  return brackets.find((bracket) => bracket.id === selectedBracketId) ?? brackets[0];
}

export default function PublishedTournamentTabs({ brackets, branding, initialSelectedBracketId }: Props) {
  const [selectedBracketId, setSelectedBracketId] = useState(() =>
    getInitialBracketId(brackets, initialSelectedBracketId),
  );

  const selectedBracket = useMemo(
    () => getSelectedBracket(brackets, selectedBracketId),
    [brackets, selectedBracketId],
  );

  function selectBracket(id: string) {
    setSelectedBracketId(id);
    const url = new URL(window.location.href);
    url.searchParams.set(BRACKET_QUERY_PARAM, id);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
  }

  if (!selectedBracket) return null;

  return (
    <div className="space-y-5">
      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        role="tablist"
        aria-label="Published tournament brackets"
      >
        {brackets.map((bracket) => {
          const isSelected = bracket.id === selectedBracket.id;
          return (
            <button
              key={bracket.id}
              id={`bracket-tab-${bracket.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`bracket-panel-${bracket.id}`}
              onClick={() => selectBracket(bracket.id)}
              className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-left text-xs font-semibold tracking-wide transition ${
                isSelected
                  ? "border-brand-gold bg-brand-gold/10 text-brand-gold"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              <span className="block">{bracket.name}</span>
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wider opacity-70">
                {bracket.seasonYear}
              </span>
            </button>
          );
        })}
      </div>

      <article
        id={`bracket-panel-${selectedBracket.id}`}
        role="tabpanel"
        aria-labelledby={`bracket-tab-${selectedBracket.id}`}
        className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-5"
      >
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">{selectedBracket.name}</h2>
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {selectedBracket.seasonYear} · Updated {selectedBracket.updatedAtLabel}
            </p>
          </div>
          <p className="max-w-sm text-xs leading-relaxed text-zinc-500 sm:hidden">
            Phone view shows games by round first. Open the full diagram inside the bracket for the printable layout.
          </p>
        </div>
        <div className="relative mt-2 w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-slate-600/50 bg-slate-300/30 p-1.5 sm:p-3">
          <div className="block w-full min-w-0 max-w-full">
            <div className="w-full min-w-0 max-w-full">
              <TournamentBracketView
                layout={selectedBracket.layout}
                themeColors={selectedBracket.themeColors}
                logoWatermarkUrl={branding.targetLogoPath}
                parentOrganizationLogo={{
                  src: branding.parentLogoPath,
                  name: branding.parentName,
                }}
                parkInfo={selectedBracket.parkInfo}
                surfaceTitleOverride={selectedBracket.name}
              />
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
