export type ScoreRecord = {
  gameExternalId: string;
  ageGroup: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
};

export type TeamStanding = {
  team: string;
  wins: number;
  losses: number;
  ties: number;
  runsScored: number;
  runsAllowed: number;
  runDifferential: number;
  winningPercentage: number;
};

export type AgeGroupStandings = {
  ageGroup: string;
  rows: TeamStanding[];
};

function getAgeGroupSortValue(ageGroup: string): number {
  const normalized = ageGroup.trim().toUpperCase();
  const numericMatch =
    normalized.match(/^(\d+)\s*U$/) || normalized.match(/^(\d+)/);
  return numericMatch ? Number(numericMatch[1]) : Number.POSITIVE_INFINITY;
}

function sortAgeGroups(a: string, b: string): number {
  const aValue = getAgeGroupSortValue(a);
  const bValue = getAgeGroupSortValue(b);
  if (aValue !== bValue) return aValue - bValue;
  return a.localeCompare(b);
}

function getWinningPercentage(
  wins: number,
  losses: number,
  ties: number,
): number {
  const totalGames = wins + losses + ties;
  if (totalGames === 0) return 0;
  return (wins + ties * 0.5) / totalGames;
}

export function computeStandingsByAgeGroup(
  records: ScoreRecord[],
): AgeGroupStandings[] {
  const ageGroupMap = new Map<string, Map<string, TeamStanding>>();

  for (const record of records) {
    const ageGroup = (record.ageGroup || "Unassigned").trim() || "Unassigned";
    if (!ageGroupMap.has(ageGroup)) {
      ageGroupMap.set(ageGroup, new Map<string, TeamStanding>());
    }

    const teamMap = ageGroupMap.get(ageGroup)!;

    const ensureTeam = (teamName: string) => {
      if (!teamMap.has(teamName)) {
        teamMap.set(teamName, {
          team: teamName,
          wins: 0,
          losses: 0,
          ties: 0,
          runsScored: 0,
          runsAllowed: 0,
          runDifferential: 0,
          winningPercentage: 0,
        });
      }
      return teamMap.get(teamName)!;
    };

    const home = ensureTeam(record.homeTeam);
    const away = ensureTeam(record.awayTeam);

    home.runsScored += record.homeScore;
    home.runsAllowed += record.awayScore;

    away.runsScored += record.awayScore;
    away.runsAllowed += record.homeScore;

    if (record.homeScore > record.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (record.awayScore > record.homeScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
  }

  return Array.from(ageGroupMap.entries())
    .sort(([a], [b]) => sortAgeGroups(a, b))
    .map(([ageGroup, teamMap]) => {
      const rows = Array.from(teamMap.values())
        .map((row) => {
          const runDifferential = row.runsScored - row.runsAllowed;
          const winningPercentage = getWinningPercentage(
            row.wins,
            row.losses,
            row.ties,
          );
          return {
            ...row,
            runDifferential,
            winningPercentage,
          };
        })
        .sort((a, b) => {
          if (b.winningPercentage !== a.winningPercentage) {
            return b.winningPercentage - a.winningPercentage;
          }
          if (b.runDifferential !== a.runDifferential) {
            return b.runDifferential - a.runDifferential;
          }
          if (b.runsScored !== a.runsScored) {
            return b.runsScored - a.runsScored;
          }
          return a.team.localeCompare(b.team);
        });

      return { ageGroup, rows };
    });
}
