"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AdminTeamsManager from "@/components/admin/AdminTeamsManager";
import AdminScoresManager from "@/components/admin/AdminScoresManager";
import AdminSchedulerManager from "@/components/admin/AdminSchedulerManager";
import AdminAssignrHub from "@/components/admin/AdminAssignrHub";
import AdminSportsConnectDesk from "@/components/admin/AdminSportsConnectDesk";
import AdminRegistrationWindowsManager from "@/components/admin/AdminRegistrationWindowsManager";
import type { ContentOrgId } from "@/lib/siteConfig";

export type CompetitionTab =
  | "teams"
  | "scores"
  | "scheduler"
  | "assignr"
  | "sports-connect"
  | "registration";

const TAB_META: Record<
  CompetitionTab,
  { label: string; description: string }
> = {
  teams: {
    label: "Teams & Rosters",
    description: "Manage team rosters, coach assignments, and player imports.",
  },
  scores: {
    label: "Scores & Standings",
    description: "Enter game scores, view logs, and keep standings current.",
  },
  scheduler: {
    label: "Scheduler & Drafts",
    description: "Build seasons, manage field availability, and generate game drafts.",
  },
  assignr: {
    label: "Umpire Desk (Assignr)",
    description: "Sync schedules, official assignments, and umpire pay with Assignr.",
  },
  "sports-connect": {
    label: "SportsConnect Import",
    description: "Assisted SportsConnect data loads and mapping presets.",
  },
  registration: {
    label: "Registration Windows",
    description: "Configure public registration open and close dates.",
  },
};

export default function CompetitionHub({
  targetOrg,
  initialTab,
  isMaster,
}: {
  targetOrg: ContentOrgId;
  initialTab: CompetitionTab;
  isMaster: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = useMemo(() => {
    const fromUrl = searchParams.get("tab") as CompetitionTab;
    if (fromUrl && TAB_META[fromUrl]) return fromUrl;
    return initialTab;
  }, [searchParams, initialTab]);

  const setTab = useCallback(
    (next: CompetitionTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      params.set("org", targetOrg);
      router.push(`/admin/competition?${params.toString()}`);
    },
    [router, searchParams, targetOrg],
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800">
        <nav className="-mb-px flex flex-wrap gap-2 sm:gap-6" aria-label="Competition Hub Sections">
          {(Object.keys(TAB_META) as CompetitionTab[]).map((t) => {
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
        {tab === "teams" && <AdminTeamsManager targetOrg={targetOrg} />}
        {tab === "scores" && <AdminScoresManager targetOrg={targetOrg} />}
        {tab === "scheduler" && <AdminSchedulerManager targetOrg={targetOrg} />}
        {tab === "assignr" && <AdminAssignrHub targetOrg={targetOrg} />}
        {tab === "sports-connect" && <AdminSportsConnectDesk targetOrg={targetOrg} />}
        {tab === "registration" && <AdminRegistrationWindowsManager organizationId={targetOrg} />}
      </div>
    </div>
  );
}
