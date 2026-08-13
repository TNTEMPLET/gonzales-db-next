"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import TournamentBracketsClient from "@/components/admin/TournamentBracketsClient";
import TournamentAlertsPanel from "@/components/admin/TournamentAlertsPanel";
import AdminAlertsManager from "@/components/admin/AdminAlertsManager";
import ParkInfoEditorClient from "@/components/admin/ParkInfoEditorClient";
import type { ContentOrgId } from "@/lib/siteConfig";

export type ParkTab = "brackets" | "alerts" | "facilities";

const TAB_META: Record<ParkTab, { label: string; description: string }> = {
  brackets: {
    label: "Bracket Engine",
    description: "Build tournament brackets from seeds, review layout, and export printable flyers.",
  },
  alerts: {
    label: "Tournament & Rainouts",
    description: "Monitor alert provider status and issue automatic or manual rainout alerts.",
  },
  facilities: {
    label: "Park Info & Rules",
    description: "Manage tournament rules, parking guidelines, and field layout maps.",
  },
};

export default function ParkHub({
  targetOrg,
  initialTab,
  isMaster,
}: {
  targetOrg: ContentOrgId;
  initialTab: ParkTab;
  isMaster: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = useMemo(() => {
    const fromUrl = searchParams.get("tab") as ParkTab;
    if (fromUrl && TAB_META[fromUrl]) return fromUrl;
    return initialTab;
  }, [searchParams, initialTab]);

  const setTab = useCallback(
    (next: ParkTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      params.set("org", targetOrg);
      router.push(`/admin/park?${params.toString()}`);
    },
    [router, searchParams, targetOrg],
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex flex-wrap gap-2 sm:gap-6" aria-label="Park Hub Sections">
          {(Object.keys(TAB_META) as ParkTab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${
                  active
                    ? "border-red-500 text-white"
                    : "border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                {TAB_META[t].label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
        <p className="mb-6 text-sm text-zinc-400">{TAB_META[tab].description}</p>
        {tab === "brackets" && <TournamentBracketsClient />}
        {tab === "alerts" && (
          <div className="space-y-8">
            <AdminAlertsManager targetOrg={targetOrg} />
            <TournamentAlertsPanel />
          </div>
        )}
        {tab === "facilities" && <ParkInfoEditorClient targetOrg={targetOrg} />}
      </div>
    </div>
  );
}
