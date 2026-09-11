import { parseSeasonGamesPerTeam } from "./seasonWindows";
import { addMinutes, dateKey } from "./validation";
import { parseFieldPriorityIds } from "./fieldPriority";
import { buildSchedulerSlots, checkDraftGameConflicts, summarizeFairness } from "./generator";
import type {
  GeneratedDraftGame,
  SchedulerAvailability,
  SchedulerDivisionRule,
  SchedulerErrorCode,
  SchedulerField,
  SchedulerGenerationResult,
  SchedulerSeason,
  SchedulerSlot,
  SchedulerTeam,
} from "./types";
import { playableSchedulerTeams } from "./realTeams";

function slotMatchesDivision(slot: SchedulerSlot, division: string, ageGroup: string): boolean {
  const haystack = [...slot.supportedDivisions, ...slot.supportedAgeGroups];
  if (!haystack.length) return true;
  return haystack.includes(division) || haystack.includes(ageGroup);
}

function pickNightSlots(slots: SchedulerSlot[], priorityIds: string[]): SchedulerSlot[] | null {
  const byField = new Map<string, SchedulerSlot[]>();
  for (const slot of slots) {
    const list = byField.get(slot.fieldId) ?? [];
    list.push(slot);
    byField.set(slot.fieldId, list);
  }
  const ranked = [
    ...priorityIds.filter((id) => byField.has(id)),
    ...[...byField.keys()].filter((id) => !priorityIds.includes(id)),
  ];
  for (const fieldId of ranked) {
    const unique = [...(byField.get(fieldId) ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const times = [...new Set(unique.map((slot) => slot.startTime))];
    if (times.length >= 2) {
      const early = unique.find((slot) => slot.startTime === times[0]);
      const late = unique.find((slot) => slot.startTime === times[1]);
      if (early && late) return [early, late];
    }
  }
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.fieldId.localeCompare(b.fieldId));
  if (sorted.length < 2) return null;
  if (sorted[0]!.startTime === sorted[1]!.startTime) return null;
  return [sorted[0]!, sorted[1]!];
}

export type DhNightSides = {
  earlyHome: SchedulerTeam;
  earlyAway: SchedulerTeam;
  lateHome: SchedulerTeam;
  lateAway: SchedulerTeam;
};

type DhFairnessCounts = {
  home: Map<string, number>;
  away: Map<string, number>;
  early: Map<string, number>;
  late: Map<string, number>;
  pairHome: Map<string, number>;
};

function emptyDhCounts(): DhFairnessCounts {
  return {
    home: new Map(),
    away: new Map(),
    early: new Map(),
    late: new Map(),
    pairHome: new Map(),
  };
}

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function cloneCounts(counts: DhFairnessCounts): DhFairnessCounts {
  return {
    home: new Map(counts.home),
    away: new Map(counts.away),
    early: new Map(counts.early),
    late: new Map(counts.late),
    pairHome: new Map(counts.pairHome),
  };
}

function applyDhNight(counts: DhFairnessCounts, night: DhNightSides): DhFairnessCounts {
  const next = cloneCounts(counts);
  bump(next.home, night.earlyHome.id);
  bump(next.away, night.earlyAway.id);
  bump(next.early, night.earlyHome.id);
  bump(next.early, night.earlyAway.id);
  bump(next.pairHome, `${night.earlyHome.id}::${night.earlyAway.id}`);
  bump(next.home, night.lateHome.id);
  bump(next.away, night.lateAway.id);
  bump(next.late, night.lateHome.id);
  bump(next.late, night.lateAway.id);
  bump(next.pairHome, `${night.lateHome.id}::${night.lateAway.id}`);
  return next;
}

function dhFairnessCost(counts: DhFairnessCounts, teamIds: string[]): number {
  let cost = 0;
  for (const id of teamIds) {
    cost += 4 * Math.abs((counts.home.get(id) ?? 0) - (counts.away.get(id) ?? 0));
    cost += 2 * Math.abs((counts.early.get(id) ?? 0) - (counts.late.get(id) ?? 0));
  }
  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      const a = teamIds[i]!;
      const b = teamIds[j]!;
      const ab = counts.pairHome.get(`${a}::${b}`) ?? 0;
      const ba = counts.pairHome.get(`${b}::${a}`) ?? 0;
      cost += 3 * Math.abs(ab - ba);
    }
  }
  return cost;
}

function dhNightCandidates(dh: SchedulerTeam, first: SchedulerTeam, second: SchedulerTeam): DhNightSides[] {
  return [
    { earlyHome: dh, earlyAway: first, lateHome: second, lateAway: dh },
    { earlyHome: dh, earlyAway: second, lateHome: first, lateAway: dh },
    { earlyHome: first, earlyAway: dh, lateHome: dh, lateAway: second },
    { earlyHome: second, earlyAway: dh, lateHome: dh, lateAway: first },
  ];
}

export function pickDhNightAssignment(
  dh: SchedulerTeam,
  others: [SchedulerTeam, SchedulerTeam],
  counts: DhFairnessCounts,
): DhNightSides {
  const teamIds = [dh.id, others[0].id, others[1].id];
  const candidates = dhNightCandidates(dh, others[0], others[1]);
  const preferred = dhNightCandidates(dh, others[0], others[1])[0]!;
  let best = preferred;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const cost = dhFairnessCost(applyDhNight(counts, candidate), teamIds);
    const isPreferred =
      candidate.earlyHome.id === preferred.earlyHome.id &&
      candidate.earlyAway.id === preferred.earlyAway.id &&
      candidate.lateHome.id === preferred.lateHome.id;
    if (cost < bestCost || (cost === bestCost && isPreferred)) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}

function toGame(params: {
  division: string;
  ageGroup: string;
  home: SchedulerTeam;
  away: SchedulerTeam;
  slot: SchedulerSlot;
  gameNumber: number;
  roundLabel: string;
}): GeneratedDraftGame {
  return {
    division: params.division,
    ageGroup: params.ageGroup,
    homeTeamId: params.home.id,
    awayTeamId: params.away.id,
    homeTeamName: params.home.teamName,
    awayTeamName: params.away.teamName,
    roundLabel: params.roundLabel,
    gameNumber: params.gameNumber,
    gameDate: params.slot.date,
    startTime: params.slot.startTime,
    endTime: params.slot.endTime || addMinutes(params.slot.startTime, 90),
    parkId: params.slot.parkId,
    fieldId: params.slot.fieldId,
    status: "DRAFT",
    sortOrder: params.gameNumber,
    conflictFlags: [],
    fairnessMetadata: { packer: "threeTeamDoubleheader" },
    schedulerNotes: null,
  };
}

export function occupyingSlotKey(game: {
  fieldId: string | null;
  gameDate: Date | string | null;
  startTime: string | null;
}): string | null {
  if (!game.fieldId || !game.gameDate || !game.startTime) return null;
  const day = typeof game.gameDate === "string" ? game.gameDate.slice(0, 10) : dateKey(game.gameDate);
  return `${game.fieldId}|${day}|${game.startTime}`;
}

function slotOccupyingKey(slot: SchedulerSlot): string {
  return `${slot.fieldId}|${slot.gameDate}|${slot.startTime}`;
}

function countsFromExistingGames(games: GeneratedDraftGame[]): DhFairnessCounts {
  const counts = emptyDhCounts();
  const byDate = new Map<string, GeneratedDraftGame[]>();
  for (const game of games) {
    if (!game.gameDate || !game.startTime) continue;
    const key = dateKey(game.gameDate);
    const list = byDate.get(key) ?? [];
    list.push(game);
    byDate.set(key, list);
  }
  for (const night of byDate.values()) {
    const times = [...new Set(night.map((game) => game.startTime).filter((time): time is string => Boolean(time)))].sort();
    const earlyTime = times[0];
    for (const game of night) {
      if (!game.homeTeamId || !game.awayTeamId) continue;
      bump(counts.home, game.homeTeamId);
      bump(counts.away, game.awayTeamId);
      bump(counts.pairHome, `${game.homeTeamId}::${game.awayTeamId}`);
      if (game.startTime === earlyTime) {
        bump(counts.early, game.homeTeamId);
        bump(counts.early, game.awayTeamId);
      } else {
        bump(counts.late, game.homeTeamId);
        bump(counts.late, game.awayTeamId);
      }
    }
  }
  return counts;
}

export function continueThreeTeamDoubleheaders(params: {
  organizationId: string;
  season: SchedulerSeason;
  teams: SchedulerTeam[];
  fields: SchedulerField[];
  availabilities: SchedulerAvailability[];
  rules: SchedulerDivisionRule[];
  divisions: string[];
  existingGames: GeneratedDraftGame[];
  occupiedKeys: Set<string>;
  fillStartsOn: string;
  fillEndsOn: string;
  extraGamesPerTeam: number | null;
}): SchedulerGenerationResult {
  const errors: SchedulerGenerationResult["errors"] = [];
  const slots = buildSchedulerSlots(params);
  const added: GeneratedDraftGame[] = [];
  const occupied = new Set(params.occupiedKeys);
  let gameNumber =
    Math.max(0, ...params.existingGames.map((game) => game.gameNumber || 0), ...added.map((game) => game.gameNumber || 0)) + 1;

  for (const division of params.divisions) {
    const rule = params.rules.find((entry) => entry.division === division);
    if (!rule) {
      errors.push({ code: "MISSING_MATRIX_RULES", message: `Missing matrix rule for ${division}` });
      continue;
    }
    const ageGroup = rule.ageGroup || division;
    const teams = playableSchedulerTeams(params.teams.filter((team) => team.ageGroup === ageGroup)).sort((a, b) =>
      a.teamName.localeCompare(b.teamName),
    );
    if (teams.length !== 3) {
      errors.push({
        code: "MISSING_TEAMS",
        message: `${division} doubleheaders need exactly 3 teams (found ${teams.length})`,
        details: { division, teamCount: teams.length },
      });
      continue;
    }
    const divisionExisting = params.existingGames.filter((game) => game.division === division);
    const totals = new Map(teams.map((team) => [team.id, 0]));
    const baseline = new Map(teams.map((team) => [team.id, 0]));
    for (const game of divisionExisting) {
      if (game.homeTeamId) totals.set(game.homeTeamId, (totals.get(game.homeTeamId) ?? 0) + 1);
      if (game.awayTeamId) totals.set(game.awayTeamId, (totals.get(game.awayTeamId) ?? 0) + 1);
    }
    for (const team of teams) baseline.set(team.id, totals.get(team.id) ?? 0);
    const existingDates = new Set(
      divisionExisting.filter((game) => game.gameDate).map((game) => dateKey(game.gameDate!)),
    );
    const divisionSlots = slots.filter((slot) => {
      if (!slotMatchesDivision(slot, division, ageGroup)) return false;
      if (slot.gameDate < params.fillStartsOn || slot.gameDate > params.fillEndsOn) return false;
      if (existingDates.has(slot.gameDate)) return false;
      return !occupied.has(slotOccupyingKey(slot));
    });
    const byDate = new Map<string, SchedulerSlot[]>();
    for (const slot of divisionSlots) {
      const list = byDate.get(slot.gameDate) ?? [];
      list.push(slot);
      byDate.set(slot.gameDate, list);
    }
    const nights = [...byDate.keys()].sort();
    const priorityIds = parseFieldPriorityIds(rule.ruleMetadata);
    let nightIndex = 0;
    let fairnessCounts = countsFromExistingGames(divisionExisting);
    const extra = params.extraGamesPerTeam;
    for (const date of nights) {
      if (extra != null && teams.every((team) => (totals.get(team.id) ?? 0) >= (baseline.get(team.id) ?? 0) + extra)) {
        break;
      }
      const pair = pickNightSlots(byDate.get(date) ?? [], priorityIds);
      if (!pair) continue;
      if (occupied.has(slotOccupyingKey(pair[0])) || occupied.has(slotOccupyingKey(pair[1]))) continue;
      const dh = [...teams].sort((a, b) => {
        const gamesA = totals.get(a.id) ?? 0;
        const gamesB = totals.get(b.id) ?? 0;
        if (gamesA !== gamesB) return gamesA - gamesB;
        return teams.indexOf(a) - teams.indexOf(b);
      })[0]!;
      const others = teams.filter((team) => team.id !== dh.id) as [SchedulerTeam, SchedulerTeam];
      const [early, late] = pair;
      const sides = pickDhNightAssignment(dh, others, fairnessCounts);
      fairnessCounts = applyDhNight(fairnessCounts, sides);
      const earlyGame = toGame({
        division,
        ageGroup,
        home: sides.earlyHome,
        away: sides.earlyAway,
        slot: early,
        gameNumber,
        roundLabel: `DH ${dateKey(early.date)} early`,
      });
      gameNumber += 1;
      const lateGame = toGame({
        division,
        ageGroup,
        home: sides.lateHome,
        away: sides.lateAway,
        slot: late,
        gameNumber,
        roundLabel: `DH ${dateKey(late.date)} late`,
      });
      gameNumber += 1;
      added.push(earlyGame, lateGame);
      occupied.add(slotOccupyingKey(early));
      occupied.add(slotOccupyingKey(late));
      totals.set(dh.id, (totals.get(dh.id) ?? 0) + 2);
      totals.set(others[0].id, (totals.get(others[0].id) ?? 0) + 1);
      totals.set(others[1].id, (totals.get(others[1].id) ?? 0) + 1);
      nightIndex += 1;
    }
    if (nightIndex === 0 && extra == null) {
      errors.push({
        code: "INSUFFICIENT_SLOTS" satisfies SchedulerErrorCode,
        message: `${division} has no open doubleheader night in the fill window`,
        details: { division },
      });
    }
  }

  const checked = checkDraftGameConflicts(added);
  return {
    seasonId: params.season.id,
    organizationId: params.organizationId,
    requestedDivisions: params.divisions,
    slots,
    games: checked,
    fairness: summarizeFairness(checked, params.teams),
    errors,
  };
}

export function generateThreeTeamDoubleheaders(params: {
  organizationId: string;
  season: SchedulerSeason;
  teams: SchedulerTeam[];
  fields: SchedulerField[];
  availabilities: SchedulerAvailability[];
  rules: SchedulerDivisionRule[];
  divisions: string[];
}): SchedulerGenerationResult {
  const errors: SchedulerGenerationResult["errors"] = [];
  const slots = buildSchedulerSlots(params);
  const games: GeneratedDraftGame[] = [];
  const gamesPerTeam = parseSeasonGamesPerTeam(params.season.settings);
  let gameNumber = 1;

  for (const division of params.divisions) {
    const rule = params.rules.find((entry) => entry.division === division);
    if (!rule) {
      errors.push({ code: "MISSING_MATRIX_RULES", message: `Missing matrix rule for ${division}` });
      continue;
    }
    const ageGroup = rule.ageGroup || division;
    const teams = playableSchedulerTeams(params.teams.filter((team) => team.ageGroup === ageGroup)).sort((a, b) =>
      a.teamName.localeCompare(b.teamName),
    );
    if (teams.length !== 3) {
      errors.push({
        code: "MISSING_TEAMS",
        message: `${division} doubleheaders need exactly 3 teams (found ${teams.length})`,
        details: { division, teamCount: teams.length },
      });
      continue;
    }
    const divisionSlots = slots.filter((slot) => slotMatchesDivision(slot, division, ageGroup));
    const byDate = new Map<string, SchedulerSlot[]>();
    for (const slot of divisionSlots) {
      const list = byDate.get(slot.gameDate) ?? [];
      list.push(slot);
      byDate.set(slot.gameDate, list);
    }
    const nights = [...byDate.keys()].sort();
    const totals = new Map(teams.map((team) => [team.id, 0]));
    const priorityIds = parseFieldPriorityIds(rule.ruleMetadata);
    let nightIndex = 0;
    let fairnessCounts = emptyDhCounts();
    for (const date of nights) {
      if (teams.every((team) => (totals.get(team.id) ?? 0) >= gamesPerTeam)) break;
      const pair = pickNightSlots(byDate.get(date) ?? [], priorityIds);
      if (!pair) continue;
      const dh = [...teams].sort((a, b) => {
        const gamesA = totals.get(a.id) ?? 0;
        const gamesB = totals.get(b.id) ?? 0;
        if (gamesA !== gamesB) return gamesA - gamesB;
        return teams.indexOf(a) - teams.indexOf(b);
      })[0]!;
      const others = teams.filter((team) => team.id !== dh.id) as [SchedulerTeam, SchedulerTeam];
      const [early, late] = pair;
      const sides = pickDhNightAssignment(dh, others, fairnessCounts);
      fairnessCounts = applyDhNight(fairnessCounts, sides);
      games.push(
        toGame({
          division,
          ageGroup,
          home: sides.earlyHome,
          away: sides.earlyAway,
          slot: early,
          gameNumber,
          roundLabel: `DH ${dateKey(early.date)} early`,
        }),
      );
      gameNumber += 1;
      games.push(
        toGame({
          division,
          ageGroup,
          home: sides.lateHome,
          away: sides.lateAway,
          slot: late,
          gameNumber,
          roundLabel: `DH ${dateKey(late.date)} late`,
        }),
      );
      gameNumber += 1;
      totals.set(dh.id, (totals.get(dh.id) ?? 0) + 2);
      totals.set(others[0].id, (totals.get(others[0].id) ?? 0) + 1);
      totals.set(others[1].id, (totals.get(others[1].id) ?? 0) + 1);
      nightIndex += 1;
    }
    if (nightIndex === 0) {
      errors.push({
        code: "INSUFFICIENT_SLOTS" satisfies SchedulerErrorCode,
        message: `${division} needs two start times on a night to place a doubleheader`,
        details: { division },
      });
    }
  }

  const checked = checkDraftGameConflicts(games);
  return {
    seasonId: params.season.id,
    organizationId: params.organizationId,
    requestedDivisions: params.divisions,
    slots,
    games: checked,
    fairness: summarizeFairness(checked, params.teams),
    errors,
  };
}

export function rebalanceThreeTeamDhGames<
  T extends {
    gameDate: Date | string | null;
    startTime: string | null;
    homeTeamId: string | null;
    awayTeamId: string | null;
    homeTeamName: string;
    awayTeamName: string;
  },
>(games: T[]): T[] {
  const nights = new Map<string, T[]>();
  for (const game of games) {
    if (!game.gameDate || !game.startTime || !game.homeTeamId || !game.awayTeamId) continue;
    const key = typeof game.gameDate === "string" ? game.gameDate.slice(0, 10) : dateKey(game.gameDate);
    const list = nights.get(key) ?? [];
    list.push(game);
    nights.set(key, list);
  }
  const next = games.map((game) => ({ ...game }));
  const byRef = new Map<T, T>();
  for (let i = 0; i < games.length; i += 1) byRef.set(games[i]!, next[i]!);
  let counts = emptyDhCounts();
  for (const date of [...nights.keys()].sort()) {
    const night = [...(nights.get(date) ?? [])].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    if (night.length !== 2) continue;
    const ids = [night[0]!.homeTeamId, night[0]!.awayTeamId, night[1]!.homeTeamId, night[1]!.awayTeamId].filter(
      (id): id is string => Boolean(id),
    );
    const appear = new Map<string, number>();
    for (const id of ids) bump(appear, id);
    const dhId = [...appear.entries()].find(([, count]) => count === 2)?.[0];
    if (!dhId) continue;
    const teamById = new Map<string, SchedulerTeam>();
    for (const game of night) {
      if (game.homeTeamId) {
        teamById.set(game.homeTeamId, {
          id: game.homeTeamId,
          organizationId: "",
          seasonYear: 0,
          ageGroup: "",
          teamName: game.homeTeamName,
        });
      }
      if (game.awayTeamId) {
        teamById.set(game.awayTeamId, {
          id: game.awayTeamId,
          organizationId: "",
          seasonYear: 0,
          ageGroup: "",
          teamName: game.awayTeamName,
        });
      }
    }
    const dh = teamById.get(dhId);
    const others = [...teamById.values()].filter((team) => team.id !== dhId);
    if (!dh || others.length !== 2) continue;
    const sides = pickDhNightAssignment(dh, [others[0]!, others[1]!], counts);
    counts = applyDhNight(counts, sides);
    const early = byRef.get(night[0]!)!;
    const late = byRef.get(night[1]!)!;
    early.homeTeamId = sides.earlyHome.id;
    early.homeTeamName = sides.earlyHome.teamName;
    early.awayTeamId = sides.earlyAway.id;
    early.awayTeamName = sides.earlyAway.teamName;
    late.homeTeamId = sides.lateHome.id;
    late.homeTeamName = sides.lateHome.teamName;
    late.awayTeamId = sides.lateAway.id;
    late.awayTeamName = sides.lateAway.teamName;
  }
  return next;
}
