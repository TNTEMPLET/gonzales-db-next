export const ALL_STAR_WORKSPACE_TABS = ["overview", "roster", "ballots", "access"] as const;

export type AllStarWorkspaceTab = (typeof ALL_STAR_WORKSPACE_TABS)[number];

export function parseWorkspaceTab(value: string | null | undefined): AllStarWorkspaceTab {
  if (value === "roster" || value === "ballots" || value === "access") return value;
  return "overview";
}

export function workspaceTabLabel(tab: AllStarWorkspaceTab) {
  switch (tab) {
    case "overview":
      return "Overview";
    case "roster":
      return "Roster";
    case "ballots":
      return "Ballots";
    case "access":
      return "Access";
  }
}

export function allowedWorkspaceTabs(isLimitedVaultAccess: boolean): AllStarWorkspaceTab[] {
  if (isLimitedVaultAccess) return ["ballots", "access"];
  return [...ALL_STAR_WORKSPACE_TABS];
}
