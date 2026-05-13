"use client";

import type { ReactNode } from "react";

import {
  allowedWorkspaceTabs,
  workspaceTabLabel,
  type AllStarWorkspaceTab,
} from "@/components/admin/allStar/workspaceTypes";
import { getCycleStatusChipLabel } from "@/lib/allStar/cycleType";

type CycleSummary = {
  id: string;
  organizationId: "gonzales" | "ascension";
  seasonYear: number;
  ageGroup: string;
  allStarAgeGroupLabel: string | null;
  title: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  publishedAt?: string | null;
  closedAt?: string | null;
  accessMode: "INVITE_LIST" | "AGE_GROUP_COACHES";
  hasShowcase: boolean;
  requiredRatingsPerCoach: number;
};

type AllStarCycleWorkspaceProps = {
  cycle: CycleSummary;
  displayTitle: string;
  displayAgeGroup: string;
  tierLabel: string;
  statusBadgeClass: string;
  candidateCount: number;
  submittedCount: number | null;
  rosterTotal: number | null;
  standingsCount: number;
  activeTab: AllStarWorkspaceTab;
  onTabChange: (tab: AllStarWorkspaceTab) => void;
  isLimitedVaultAccess: boolean;
  canManage: boolean;
  manageDisabled: boolean;
  onPublish: () => void;
  onClose: () => void;
  cycleSwitcher?: ReactNode;
};

export default function AllStarCycleWorkspace({
  cycle,
  displayTitle,
  displayAgeGroup,
  tierLabel,
  statusBadgeClass,
  candidateCount,
  submittedCount,
  rosterTotal,
  standingsCount,
  activeTab,
  onTabChange,
  isLimitedVaultAccess,
  canManage,
  manageDisabled,
  onPublish,
  onClose,
  cycleSwitcher,
}: AllStarCycleWorkspaceProps) {
  const tabs = allowedWorkspaceTabs(isLimitedVaultAccess);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Selected ballot</p>
            <h2 className="text-lg font-semibold text-zinc-100 leading-snug">{displayTitle}</h2>
            {(displayAgeGroup || tierLabel) && (
              <p className="text-sm text-zinc-400">
                {[displayAgeGroup, tierLabel, String(cycle.seasonYear)]
                  .filter((part) => part != null && String(part).trim() !== "")
                  .join(" · ")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${statusBadgeClass}`}>
              {getCycleStatusChipLabel(cycle)}
            </span>
            {canManage ? (
              <>
                <button
                  type="button"
                  disabled={manageDisabled}
                  onClick={onPublish}
                  className="rounded-lg border border-emerald-700 text-emerald-300 px-3 py-2 text-sm disabled:opacity-60"
                >
                  Publish
                </button>
                <button
                  type="button"
                  disabled={manageDisabled}
                  onClick={onClose}
                  className="rounded-lg border border-amber-700 text-amber-300 px-3 py-2 text-sm disabled:opacity-60"
                >
                  Close
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400">
          <span>
            Candidates: <span className="font-semibold text-zinc-200 tabular-nums">{candidateCount}</span>
          </span>
          {submittedCount !== null && rosterTotal !== null ? (
            <span>
              Ballots in:{" "}
              <span className="font-semibold text-zinc-200 tabular-nums">
                {submittedCount}/{rosterTotal}
              </span>
            </span>
          ) : null}
          <span>
            Standings: <span className="font-semibold text-zinc-200 tabular-nums">{standingsCount}</span>
          </span>
          <span className="text-zinc-500">
            {cycle.accessMode === "INVITE_LIST" ? "Invite list" : "Age-group coaches"}
            {cycle.hasShowcase ? " · Showcase" : ""}
            {" · "}
            {cycle.requiredRatingsPerCoach} ratings per coach
          </span>
        </div>
        {cycleSwitcher ? <div className="flex flex-wrap items-center gap-3">{cycleSwitcher}</div> : null}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Cycle editor sections">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => onTabChange(tab)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "bg-brand-purple/20 text-brand-purple border border-brand-purple/40"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 border border-transparent"
              }`}
            >
              {workspaceTabLabel(tab)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
