import { sortTeamsManagementAgeGroups } from "@/lib/admin/teamsImportHelpers";
import { gameIsRainedOut, rainoutChipValue, type GameDayRainout } from "@/lib/admin/dashboard/gameDay";
import { leagueCalendarDate } from "@/lib/seasonConfig";
import { isPastKickoff, isScoreEntryPark } from "@/lib/schedule/scoreableGames";
import {
  formatPublicClock,
  formatPublicDateLabel,
} from "@/lib/schedule/publicSchedule";
import { computeStandingsByAgeGroup } from "@/lib/standings";
import type { ContentOrgId } from "@/lib/siteConfig";

export type SeasonPulseTone = "neutral" | "attention" | "failure";

export type SeasonGameInput = {
  id: string;
  dateKey: string;
  startTime: string;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  parkName: string;
  fieldName: string;
  canceled: boolean;
};

export type SeasonScoreInput = {
  gameExternalId: string;
  homeScore: number;
  awayScore: number;
};

export type PulseChip = {
  key: string;
  label: string;
  value: string;
  tone: SeasonPulseTone;
};

export type HeadlineKpi = {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: SeasonPulseTone;
};

export type CompletenessBar = {
  ageGroup: string;
  percent: number;
  scored: number;
  past: number;
};

export type WeeklyScorePoint = {
  weekStart: string;
  label: string;
  posted: number;
  scored: number;
};

export type UnscoredGameRow = {
  id: string;
  daysLate: number;
  when: string;
  ageGroup: string;
  matchup: string;
  place: string;
};

export type StandingRowView = {
  team: string;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  runsScored: number;
  runsAllowed: number;
  runDifferential: number;
  behindMedian: boolean;
};

export type DivisionStandingsView = {
  ageGroup: string;
  completenessPercent: number | null;
  unscored: number;
  rows: StandingRowView[];
};

export type WeekGameRow = {
  id: string;
  when: string;
  ageGroup: string;
  matchup: string;
  parkName: string;
  fieldName: string;
  scoreState: "scored" | "missing" | "scheduled" | "not-entered" | "canceled" | "rained-out";
};

export type OrgSeasonPicture = {
  organizationId: ContentOrgId;
  organizationLabel: string;
  seasonLabel: string;
  weekNumber: number;
  chips: PulseChip[];
  kpis: HeadlineKpi[];
  completenessByAge: CompletenessBar[];
  weekly: WeeklyScorePoint[];
  unscored: UnscoredGameRow[];
  divisions: DivisionStandingsView[];
  defaultAgeGroup: string | null;
  weekGames: WeekGameRow[];
  financeOpen: boolean;
};

export function formatDashboardCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function mondayOnOrBefore(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const utc = new Date(Date.UTC(year, month - 1, day));
  const sinceMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - sinceMonday);
  return utc.toISOString().slice(0, 10);
}

export function calendarDaysBetween(earlier: string, later: string): number {
  const start = Date.parse(`${earlier}T00:00:00.000Z`);
  const end = Date.parse(`${later}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

export function seasonWeekNumber(seasonStart: string, asOf: Date): number {
  const today = leagueCalendarDate(asOf);
  const weeks = Math.floor(
    calendarDaysBetween(mondayOnOrBefore(seasonStart), mondayOnOrBefore(today)) / 7,
  );
  return Math.max(1, weeks + 1);
}

function shortWeekLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function percent(scored: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((scored / total) * 100);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function formatGap(gap: number): string {
  return Number.isInteger(gap) ? String(gap) : gap.toFixed(1);
}

function ageLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed || "Unassigned";
}

function whenLabel(dateKey: string, startTime: string): string {
  return `${formatPublicDateLabel(dateKey)} · ${formatPublicClock(startTime)}`;
}

function placeLabel(parkName: string, fieldName: string): string {
  return [parkName, fieldName].filter(Boolean).join(" · ");
}

function winningPct(row: StandingRowView): number {
  if (row.games === 0) return 0;
  return (row.wins + row.ties * 0.5) / row.games;
}

function sortStandingRows(rows: StandingRowView[]): StandingRowView[] {
  return [...rows].sort((a, b) => {
    const pct = winningPct(b) - winningPct(a);
    if (pct !== 0) return pct;
    if (b.runDifferential !== a.runDifferential) return b.runDifferential - a.runDifferential;
    if (b.runsScored !== a.runsScored) return b.runsScored - a.runsScored;
    return a.team.localeCompare(b.team);
  });
}

export function buildOrgSeasonPicture(input: {
  organizationId: ContentOrgId;
  organizationLabel: string;
  seasonLabel: string;
  seasonStart: string;
  games: SeasonGameInput[];
  scores: SeasonScoreInput[];
  activeRainouts: number;
  rainout?: GameDayRainout | null;
  outstandingCents: number;
  priorSeasonGrossCents: number | null;
  priorSeasonYear: number | null;
  asOf?: Date;
}): OrgSeasonPicture {
  const asOf = input.asOf ?? new Date();
  const today = leagueCalendarDate(asOf);
  const thisMonday = mondayOnOrBefore(today);
  const thisSunday = addCalendarDays(thisMonday, 6);
  const lastMonday = addCalendarDays(thisMonday, -7);
  const weekNumber = seasonWeekNumber(input.seasonStart, asOf);
  const scoredIds = new Set(input.scores.map((score) => score.gameExternalId));
  const posted = input.games.filter((game) => !game.canceled);
  const canceled = input.games.filter((game) => game.canceled);
  const inThisWeek = (dateKey: string) => dateKey >= thisMonday && dateKey <= thisSunday;
  const scoreEntry = posted.filter((game) => isScoreEntryPark(game.parkName));
  const pastEntry = scoreEntry.filter((game) => {
    if (!isPastKickoff(game.dateKey, game.startTime, asOf)) return false;
    if (!scoredIds.has(game.id) && gameIsRainedOut(game, input.rainout, today)) return false;
    return true;
  });
  const scoredPast = pastEntry.filter((game) => scoredIds.has(game.id));
  const priorEntry = pastEntry.filter((game) => game.dateKey < thisMonday);
  const priorScored = priorEntry.filter((game) => scoredIds.has(game.id));
  const currentPct = percent(scoredPast.length, pastEntry.length);
  const priorPct = percent(priorScored.length, priorEntry.length);

  const unscoredGames = pastEntry
    .filter((game) => !scoredIds.has(game.id))
    .map((game) => ({
      game,
      daysLate: Math.max(0, calendarDaysBetween(game.dateKey, today)),
    }))
    .sort((a, b) => b.daysLate - a.daysLate || a.game.dateKey.localeCompare(b.game.dateKey) || a.game.startTime.localeCompare(b.game.startTime));

  const postedThisWeek = posted.filter((game) => inThisWeek(game.dateKey));
  const canceledThisWeek = canceled.filter((game) => inThisWeek(game.dateKey));
  const postedLastWeek = posted.filter(
    (game) => game.dateKey >= lastMonday && game.dateKey < thisMonday,
  );
  const tonight = posted.filter((game) => game.dateKey === today);

  const byAge = new Map<string, SeasonGameInput[]>();
  for (const game of pastEntry) {
    const key = ageLabel(game.ageGroup);
    const rows = byAge.get(key) ?? [];
    rows.push(game);
    byAge.set(key, rows);
  }

  const completenessByAge: CompletenessBar[] = Array.from(byAge.entries())
    .map(([ageGroup, games]) => {
      const scored = games.filter((game) => scoredIds.has(game.id)).length;
      return {
        ageGroup,
        past: games.length,
        scored,
        percent: percent(scored, games.length) ?? 0,
      };
    })
    .sort((a, b) => sortTeamsManagementAgeGroups(a.ageGroup, b.ageGroup));

  const scoreRecords = pastEntry.flatMap((game) => {
    if (!scoredIds.has(game.id)) return [];
    const saved = input.scores.find((score) => score.gameExternalId === game.id);
    if (!saved) return [];
    return [
      {
        gameExternalId: game.id,
        ageGroup: ageLabel(game.ageGroup),
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeScore: saved.homeScore,
        awayScore: saved.awayScore,
      },
    ];
  });
  const standings = computeStandingsByAgeGroup(scoreRecords);
  const standingsByAge = new Map(standings.map((group) => [group.ageGroup, group.rows]));

  const divisions: DivisionStandingsView[] = Array.from(byAge.entries())
    .map(([ageGroup, games]) => {
      const counts = new Map<string, number>();
      for (const game of games) {
        counts.set(game.homeTeam, counts.get(game.homeTeam) ?? 0);
        counts.set(game.awayTeam, counts.get(game.awayTeam) ?? 0);
        if (scoredIds.has(game.id)) {
          counts.set(game.homeTeam, (counts.get(game.homeTeam) ?? 0) + 1);
          counts.set(game.awayTeam, (counts.get(game.awayTeam) ?? 0) + 1);
        }
      }
      const existing = new Map((standingsByAge.get(ageGroup) ?? []).map((row) => [row.team, row]));
      const draft: StandingRowView[] = Array.from(counts.entries()).map(([team, gamesPlayed]) => {
        const row = existing.get(team);
        return {
          team,
          wins: row?.wins ?? 0,
          losses: row?.losses ?? 0,
          ties: row?.ties ?? 0,
          games: row ? row.wins + row.losses + row.ties : gamesPlayed,
          runsScored: row?.runsScored ?? 0,
          runsAllowed: row?.runsAllowed ?? 0,
          runDifferential: row?.runDifferential ?? 0,
          behindMedian: false,
        };
      });
      const midpoint = median(draft.map((row) => row.games));
      const rows = sortStandingRows(
        draft.map((row) => ({ ...row, behindMedian: row.games < midpoint })),
      );
      const scored = games.filter((game) => scoredIds.has(game.id)).length;
      return {
        ageGroup,
        completenessPercent: percent(scored, games.length),
        unscored: games.length - scored,
        rows,
      };
    })
    .sort((a, b) => sortTeamsManagementAgeGroups(a.ageGroup, b.ageGroup));

  const defaultDivision = [...divisions].sort((a, b) => {
    const left = a.completenessPercent ?? 100;
    const right = b.completenessPercent ?? 100;
    if (left !== right) return left - right;
    if (b.unscored !== a.unscored) return b.unscored - a.unscored;
    return sortTeamsManagementAgeGroups(a.ageGroup, b.ageGroup);
  })[0];

  let worstGap: { team: string; ageGroup: string; gap: number } | null = null;
  let teamsBehind = 0;
  for (const division of divisions) {
    const midpoint = median(division.rows.map((row) => row.games));
    for (const row of division.rows) {
      if (!row.behindMedian) continue;
      teamsBehind += 1;
      const gap = midpoint - row.games;
      if (!worstGap || gap > worstGap.gap) {
        worstGap = { team: row.team, ageGroup: division.ageGroup, gap };
      }
    }
  }

  const weekly = weeklyScorePoints(
    scoreEntry.filter((game) => scoredIds.has(game.id) || !gameIsRainedOut(game, input.rainout, today)),
    scoredIds,
    thisMonday,
    asOf,
  );

  const oldestLate = unscoredGames.find((row) => row.daysLate >= 1);
  const chips: PulseChip[] = [
    {
      key: "season",
      label: input.seasonLabel,
      value: `Week ${weekNumber}`,
      tone: "neutral",
    },
    {
      key: "tonight",
      label: "Tonight",
      value: tonight.length === 0 ? "No games" : `${tonight.length} game${tonight.length === 1 ? "" : "s"}`,
      tone: "neutral",
    },
    {
      key: "unscored",
      label: "Unscored",
      value: String(unscoredGames.length),
      tone: oldestLate ? "failure" : unscoredGames.length > 0 ? "attention" : "neutral",
    },
    {
      key: "canceled",
      label: "Canceled this week",
      value: String(canceledThisWeek.length),
      tone: canceledThisWeek.length > 0 ? "attention" : "neutral",
    },
    {
      key: "rainout",
      label: "Rainout",
      value: rainoutChipValue(input.rainout, input.activeRainouts).value,
      tone: rainoutChipValue(input.rainout, input.activeRainouts).active ? "failure" : "neutral",
    },
  ];

  const kpis: HeadlineKpi[] = [
    {
      key: "completeness",
      label: "Score completeness",
      value: currentPct === null ? "—" : `${currentPct}%`,
      detail:
        currentPct === null
          ? "No games have started"
          : priorPct === null
            ? "Nothing to compare before this week"
            : `Before this week: ${priorPct}% scored`,
      tone: currentPct !== null && currentPct < 100 ? "attention" : "neutral",
    },
    {
      key: "unscored",
      label: "Unscored games",
      value: String(unscoredGames.length),
      detail:
        unscoredGames.length === 0
          ? "The book is current"
          : oldestLate
            ? `Oldest is ${oldestLate.daysLate} day${oldestLate.daysLate === 1 ? "" : "s"} late`
            : "All from today",
      tone: oldestLate ? "failure" : unscoredGames.length > 0 ? "attention" : "neutral",
    },
    {
      key: "week",
      label: "Posted this week",
      value: String(postedThisWeek.length),
      detail: `${canceledThisWeek.length} canceled · ${postedLastWeek.length} posted last week`,
      tone: canceledThisWeek.length > 0 ? "attention" : "neutral",
    },
    {
      key: "equity",
      label: "Teams behind the median",
      value: pastEntry.length === 0 ? "—" : String(teamsBehind),
      detail:
        pastEntry.length === 0
          ? "No games have started"
          : teamsBehind === 0
            ? "Every team with a started game is at the division median"
            : worstGap
              ? `${worstGap.team} is ${formatGap(worstGap.gap)} game${worstGap.gap === 1 ? "" : "s"} behind the ${worstGap.ageGroup} median`
              : `${teamsBehind} teams are behind their division`,
      tone: teamsBehind > 0 ? "attention" : "neutral",
    },
    {
      key: "fees",
      label: "Fees still out",
      value: formatDashboardCents(input.outstandingCents),
      detail:
        input.priorSeasonGrossCents !== null && input.priorSeasonYear
          ? `${input.priorSeasonYear} gross ${formatDashboardCents(input.priorSeasonGrossCents)}`
          : "No prior-season registrations",
      tone: input.outstandingCents > 0 ? "attention" : "neutral",
    },
  ];

  const weekGames = [...postedThisWeek, ...canceledThisWeek]
    .sort(
      (a, b) =>
        a.parkName.localeCompare(b.parkName) ||
        a.dateKey.localeCompare(b.dateKey) ||
        a.startTime.localeCompare(b.startTime) ||
        sortTeamsManagementAgeGroups(ageLabel(a.ageGroup), ageLabel(b.ageGroup)),
    )
    .map((game): WeekGameRow => {
      let scoreState: WeekGameRow["scoreState"] = "scheduled";
      if (game.canceled) scoreState = "canceled";
      else if (gameIsRainedOut(game, input.rainout, today) && !scoredIds.has(game.id)) scoreState = "rained-out";
      else if (!isScoreEntryPark(game.parkName)) scoreState = "not-entered";
      else if (scoredIds.has(game.id)) scoreState = "scored";
      else if (isPastKickoff(game.dateKey, game.startTime, asOf)) scoreState = "missing";
      return {
        id: game.id,
        when: whenLabel(game.dateKey, game.startTime),
        ageGroup: ageLabel(game.ageGroup),
        matchup: `${game.homeTeam} vs ${game.awayTeam}`,
        parkName: game.parkName,
        fieldName: game.fieldName,
        scoreState,
      };
    });

  return {
    organizationId: input.organizationId,
    organizationLabel: input.organizationLabel,
    seasonLabel: input.seasonLabel,
    weekNumber,
    chips,
    kpis,
    completenessByAge,
    weekly,
    unscored: unscoredGames.map(({ game, daysLate }) => ({
      id: game.id,
      daysLate,
      when: whenLabel(game.dateKey, game.startTime),
      ageGroup: ageLabel(game.ageGroup),
      matchup: `${game.homeTeam} vs ${game.awayTeam}`,
      place: placeLabel(game.parkName, game.fieldName),
    })),
    divisions,
    defaultAgeGroup: defaultDivision?.ageGroup ?? null,
    weekGames,
    financeOpen: input.outstandingCents > 0 || weekNumber <= 3,
  };
}

function weeklyScorePoints(
  scoreEntry: SeasonGameInput[],
  scoredIds: Set<string>,
  thisMonday: string,
  asOf: Date,
): WeeklyScorePoint[] {
  const due = scoreEntry.filter((game) => isPastKickoff(game.dateKey, game.startTime, asOf));
  if (due.length === 0) return [];
  const first = due.reduce(
    (earliest, game) => (game.dateKey < earliest ? game.dateKey : earliest),
    due[0]?.dateKey ?? thisMonday,
  );
  const points: WeeklyScorePoint[] = [];
  let cursor = mondayOnOrBefore(first);
  while (cursor <= thisMonday && points.length < 40) {
    const next = addCalendarDays(cursor, 7);
    const games = due.filter((game) => game.dateKey >= cursor && game.dateKey < next);
    points.push({
      weekStart: cursor,
      label: shortWeekLabel(cursor),
      posted: games.length,
      scored: games.filter((game) => scoredIds.has(game.id)).length,
    });
    cursor = next;
  }
  return points;
}
