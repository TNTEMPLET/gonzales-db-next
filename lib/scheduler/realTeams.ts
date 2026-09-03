/** SportsConnect leftover-player bucket — not a playable team. */
export const UNALLOCATED_TEAM_NAME_EQUALS = {
  equals: "Unallocated",
  mode: "insensitive" as const,
};

export function isUnallocatedTeamName(teamName: string): boolean {
  return teamName.trim().toLowerCase() === "unallocated";
}

export function playableSchedulerTeams<T extends { teamName: string }>(teams: T[]): T[] {
  return teams.filter((team) => !isUnallocatedTeamName(team.teamName));
}
