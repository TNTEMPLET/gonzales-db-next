import type { ReactNode } from "react";

export const TEAM_WORKFLOW_SECTIONS = [
  { id: "teams-build", label: "Build Teams" },
  { id: "teams-import-players", label: "Import Players" },
  { id: "teams-assign-coaches", label: "Assign Coaches" },
  { id: "teams-review-rosters", label: "Review Rosters" },
  { id: "teams-import-history", label: "Import History" },
] as const;

export type TeamWorkflowSectionId = (typeof TEAM_WORKFLOW_SECTIONS)[number]["id"];

export type TeamHealthSummary = {
  totalTeams: number;
  totalRosteredPlayers: number;
  teamsMissingCoaches: number;
  teamsWithNoPlayers: number;
  recentImportLabel: string;
};

type WorkflowStepRowProps = {
  steps: readonly string[];
  currentIndex: number;
  description?: string;
};

export function WorkflowStepRow({ steps, currentIndex, description }: WorkflowStepRowProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {steps.map((step, index) => {
          const isActive = index === currentIndex;
          const isComplete = index < currentIndex;
          return (
            <div key={step} className="flex items-center gap-2">
              <span
                className={`rounded-full border px-2 py-1 ${
                  isActive
                    ? "border-brand-purple bg-brand-purple/15 text-brand-purple"
                    : isComplete
                      ? "border-emerald-700 bg-emerald-950/25 text-emerald-300"
                      : "border-zinc-700 text-zinc-400"
                }`}
              >
                {index + 1}. {step}
              </span>
              {index < steps.length - 1 ? <span className="text-zinc-600">/</span> : null}
            </div>
          );
        })}
      </div>
      {description ? <p className="text-xs text-zinc-400">{description}</p> : null}
    </div>
  );
}

type TeamsWorkflowNavigationProps = {
  activeSectionId: TeamWorkflowSectionId;
  selectedTeamId: string;
  onNavigate: (sectionId: TeamWorkflowSectionId) => void;
};

export function TeamsWorkflowNavigation({
  activeSectionId,
  selectedTeamId,
  onNavigate,
}: TeamsWorkflowNavigationProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TEAM_WORKFLOW_SECTIONS.map((section) => {
        const isActive = activeSectionId === section.id;
        const isCoachAction = section.id === "teams-assign-coaches";
        return (
          <button
            key={section.id}
            type="button"
            disabled={isCoachAction && !selectedTeamId}
            onClick={() => onNavigate(section.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              isActive
                ? "border-brand-purple bg-brand-purple/15 text-brand-purple"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}

type StatusCountPillProps = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
};

export function StatusCountPill({ label, value, valueClassName = "text-2xl font-semibold" }: StatusCountPillProps) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 ${valueClassName}`}>{value}</p>
    </div>
  );
}

type TeamHealthSummaryGridProps = {
  summary: TeamHealthSummary;
};

export function TeamHealthSummaryGrid({ summary }: TeamHealthSummaryGridProps) {
  return (
    <div className="grid gap-3 md:grid-cols-5">
      <StatusCountPill label="Teams" value={summary.totalTeams} />
      <StatusCountPill label="Rostered Players" value={summary.totalRosteredPlayers} />
      <StatusCountPill
        label="Missing Coaches"
        value={summary.teamsMissingCoaches}
        valueClassName="text-2xl font-semibold text-amber-300"
      />
      <StatusCountPill
        label="No Players"
        value={summary.teamsWithNoPlayers}
        valueClassName="text-2xl font-semibold text-amber-300"
      />
      <StatusCountPill
        label="Recent Import"
        value={summary.recentImportLabel}
        valueClassName="text-xs text-zinc-300"
      />
    </div>
  );
}
