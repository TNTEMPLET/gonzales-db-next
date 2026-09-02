export type DraftSessionStatusLike =
  | "SETUP"
  | "PAIRED"
  | "LIVE"
  | "PAUSED"
  | "COMPLETED"
  | "MATERIALIZED";

export type RosterBuildMethod = "DRAFT" | "DIRECT_IMPORT";

export type DivisionTeamSnapshot = {
  teamName: string;
  playerCount: number;
};

export type DivisionRosterBuild = {
  ageGroup: string;
  method: RosterBuildMethod | null;
  status: "COMPLETE" | "INCOMPLETE";
  href: string;
  methodLabel: string | null;
};

const DRAFT_DONE = new Set<DraftSessionStatusLike>(["COMPLETED", "MATERIALIZED"]);

export function isUnallocatedTeamName(teamName: string): boolean {
  return teamName.trim().toLowerCase() === "unallocated";
}

export function rosterBuildMethodLabel(method: RosterBuildMethod | null): string | null {
  if (method === "DRAFT") return "Draft";
  if (method === "DIRECT_IMPORT") return "Direct import";
  return null;
}

/**
 * Decide whether a division's rosters were finished through Online Draft
 * or SportsConnect Direct Import.
 *
 * Draft wins whenever a session exists: COMPLETED/MATERIALIZED is done,
 * any earlier status is in-progress (Team List rows may already exist).
 * With no draft session, Direct Import is done only when at least one
 * real team has players and nobody is left on Unallocated.
 */
export function classifyDivisionRosterBuild(params: {
  ageGroup: string;
  teams: DivisionTeamSnapshot[];
  draftStatus: DraftSessionStatusLike | null | undefined;
}): DivisionRosterBuild {
  const { ageGroup, teams, draftStatus } = params;

  if (draftStatus && DRAFT_DONE.has(draftStatus)) {
    return {
      ageGroup,
      method: "DRAFT",
      status: "COMPLETE",
      href: "/admin/draft",
      methodLabel: rosterBuildMethodLabel("DRAFT"),
    };
  }
  if (draftStatus) {
    return {
      ageGroup,
      method: "DRAFT",
      status: "INCOMPLETE",
      href: "/admin/draft",
      methodLabel: rosterBuildMethodLabel("DRAFT"),
    };
  }

  let realPlayers = 0;
  let unallocatedPlayers = 0;
  for (const team of teams) {
    if (isUnallocatedTeamName(team.teamName)) {
      unallocatedPlayers += team.playerCount;
    } else {
      realPlayers += team.playerCount;
    }
  }

  if (realPlayers > 0) {
    return {
      ageGroup,
      method: "DIRECT_IMPORT",
      status: unallocatedPlayers === 0 ? "COMPLETE" : "INCOMPLETE",
      href: "/admin/teams",
      methodLabel: rosterBuildMethodLabel("DIRECT_IMPORT"),
    };
  }

  return {
    ageGroup,
    method: null,
    status: "INCOMPLETE",
    href: "/admin/teams",
    methodLabel: null,
  };
}
