import type { BracketRound, BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  bracketFormatForChampionshipSeriesStyle,
  type ChampionshipSeriesStyle,
} from "@/lib/tournament-brackets/bracketFormat";
import {
  generateDoubleEliminationRoundsForFormat,
} from "@/lib/tournament-brackets/generateDoubleElimFromTeams";
import {
  buildLittleLeagueSixTeamModifiedDeRounds,
  buildLittleLeagueSixTeamStandardDeRounds,
} from "@/lib/tournament-brackets/ingestion/buildLittleLeagueSixTeamRounds";
import { littleLeagueSixTeamParticipantSlots } from "@/lib/tournament-brackets/littleLeagueParticipantShells";
import { officialTemplateShellSize } from "@/lib/tournament-brackets/officialTemplatePowerOfTwo";
import type { PdfGameScheduleLine } from "@/lib/tournament-brackets/ingestion/parsePdfGameRouting";
import { placeholderTeamsForCount } from "@/lib/tournament-brackets/ingestion/parsePdfBracketTemplate";

export type GoverningBodyId = "little_league" | "babe_ruth" | "cal_ripken";

export type OfficialTemplateId =
  | "little_league_3_team_de"
  | "little_league_5_team_de"
  | "little_league_6_team_de"
  | "little_league_7_team_de"
  | "little_league_8_team_de";

export type OfficialTemplateBuildOptions = {
  championshipSeriesStyle: ChampionshipSeriesStyle;
  scheduleByGame?: Map<number, PdfGameScheduleLine>;
};

export type OfficialTemplate = {
  id: OfficialTemplateId;
  governingBody: GoverningBodyId;
  label: string;
  teamCount: number;
  defaultChampionshipSeriesStyle: ChampionshipSeriesStyle;
  supportedChampionshipSeriesStyles: ChampionshipSeriesStyle[];
  lockLayout: boolean;
  pdfTemplateId?: string;
  buildRounds: (teams: string[], opts: OfficialTemplateBuildOptions) => BracketRound[];
};

const BOTH_STYLES: ChampionshipSeriesStyle[] = ["always_scheduled_reset", "winner_take_all"];

export const GOVERNING_BODY_STUBS: { id: GoverningBodyId; label: string; implemented: boolean }[] = [
  { id: "little_league", label: "Little League", implemented: true },
  { id: "babe_ruth", label: "Babe Ruth", implemented: false },
  { id: "cal_ripken", label: "Cal Ripken", implemented: false },
];

function schedulePatch(scheduleByGame: Map<number, PdfGameScheduleLine> | undefined, gameNumber: number) {
  const schedule = scheduleByGame?.get(gameNumber);
  if (!schedule) return {};
  return {
    ...(schedule.dateLabel ? { dateLabel: schedule.dateLabel } : {}),
    ...(schedule.time ? { time: schedule.time } : {}),
    ...(schedule.field ? { field: schedule.field } : {}),
  };
}

function officialMatch(
  section: "winners" | "losers" | "championship",
  gameNumber: number,
  home: string,
  away: string,
  scheduleByGame?: Map<number, PdfGameScheduleLine>,
  championshipRole?: "grand_final" | "if_necessary",
) {
  return {
    id: `official-${section}-g${gameNumber}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now()}`,
    home,
    away,
    officialGameNumber: String(gameNumber),
    ...(championshipRole ? { championshipRole } : {}),
    ...schedulePatch(scheduleByGame, gameNumber),
  };
}

function officialRound(
  section: "winners" | "losers" | "championship",
  idx: number,
  label: string,
  matches: ReturnType<typeof officialMatch>[],
): BracketRound {
  return {
    id: `official-${section}-r${idx}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now()}`,
    label,
    bracketSection: section,
    matches,
  };
}

function buildThreeTeamOfficialRounds(
  teams: string[],
  opts: OfficialTemplateBuildOptions,
): BracketRound[] {
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length !== 3) {
    throw new Error("Official 3-team template requires exactly 3 teams (got " + t.length + ").");
  }
  const schedule = opts.scheduleByGame;
  const championshipMatches = [
    officialMatch("championship", 4, "W2", "W3", schedule, "grand_final"),
  ];
  if (opts.championshipSeriesStyle === "always_scheduled_reset") {
    championshipMatches.push(
      officialMatch("championship", 5, "W4", "L4", schedule, "if_necessary"),
    );
  }

  return [
    officialRound("winners", 0, "Winners Bracket — Semifinals", [
      officialMatch("winners", 1, t[1]!, t[2]!, schedule),
    ]),
    officialRound("winners", 1, "Winners Bracket — Final", [
      officialMatch("winners", 2, t[0]!, "W1", schedule),
    ]),
    officialRound("losers", 0, "Losers Bracket", [
      officialMatch("losers", 3, "L1", "L2", schedule),
    ]),
    officialRound("championship", 0, "Championship Series", championshipMatches),
  ];
}

function buildFiveTeamOfficialRounds(
  teams: string[],
  opts: OfficialTemplateBuildOptions,
): BracketRound[] {
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length !== 5) {
    throw new Error(`Official 5-team template requires exactly 5 teams (got ${t.length}).`);
  }
  const schedule = opts.scheduleByGame;
  const championshipMatches = [
    officialMatch("championship", 8, "W5", "W7", schedule, "grand_final"),
  ];
  if (opts.championshipSeriesStyle === "always_scheduled_reset") {
    championshipMatches.push(
      officialMatch("championship", 9, "W8", "L8", schedule, "if_necessary"),
    );
  }

  return [
    officialRound("winners", 0, "Winners Bracket — Round 1", [
      officialMatch("winners", 1, t[0]!, t[1]!, schedule),
      officialMatch("winners", 2, t[2]!, t[3]!, schedule),
    ]),
    officialRound("winners", 1, "Winners Bracket — Semifinals", [
      officialMatch("winners", 3, "W1", t[4]!, schedule),
    ]),
    officialRound("losers", 0, "Losers Bracket", [
      officialMatch("losers", 4, "L2", "L1", schedule),
    ]),
    officialRound("winners", 2, "Winners Bracket — Final", [
      officialMatch("winners", 5, "W2", "W3", schedule),
    ]),
    officialRound("losers", 1, "Losers Bracket", [
      officialMatch("losers", 6, "W4", "L3", schedule),
    ]),
    officialRound("losers", 2, "Losers Bracket — Final", [
      officialMatch("losers", 7, "L5", "W6", schedule),
    ]),
    officialRound("championship", 0, "Championship Series", championshipMatches),
  ];
}

function buildSixTeamOfficialRounds(
  teams: string[],
  opts: OfficialTemplateBuildOptions,
): BracketRound[] {
  const trimmed = teams.map((s) => s.trim()).filter(Boolean);
  if (trimmed.length !== 6) {
    throw new Error(`Official 6-team template requires exactly 6 teams (got ${trimmed.length}).`);
  }
  // Derives from the smallest power-of-two shell (6 → 8 slots); see littleLeagueSixTeamParticipantSlots.
  void littleLeagueSixTeamParticipantSlots(trimmed);
  void officialTemplateShellSize(6);
  if (opts.championshipSeriesStyle === "winner_take_all") {
    return buildLittleLeagueSixTeamModifiedDeRounds(trimmed, opts.scheduleByGame);
  }
  return buildLittleLeagueSixTeamStandardDeRounds(trimmed, opts.scheduleByGame);
}

function buildSevenTeamOfficialRounds(
  teams: string[],
  opts: OfficialTemplateBuildOptions,
): BracketRound[] {
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length !== 7) {
    throw new Error(`Official 7-team template requires exactly 7 teams (got ${t.length}).`);
  }
  const schedule = opts.scheduleByGame;
  const championshipMatches = [
    officialMatch("championship", 12, "W8", "W11", schedule, "grand_final"),
  ];
  if (opts.championshipSeriesStyle === "always_scheduled_reset") {
    championshipMatches.push(
      officialMatch("championship", 13, "W12", "L12", schedule, "if_necessary"),
    );
  }

  return [
    officialRound("winners", 0, "Winners Bracket — Round 1", [
      officialMatch("winners", 1, t[0]!, t[1]!, schedule),
      officialMatch("winners", 2, t[2]!, t[3]!, schedule),
      officialMatch("winners", 3, t[4]!, t[5]!, schedule),
    ]),
    officialRound("winners", 1, "Winners Bracket — Round 2", [
      officialMatch("winners", 4, "W1", t[6]!, schedule),
      officialMatch("winners", 5, "W2", "W3", schedule),
    ]),
    officialRound("winners", 2, "Winners Bracket — Final", [
      officialMatch("winners", 8, "W4", "W5", schedule),
    ]),
    officialRound("losers", 0, "Losers Bracket — Round 1", [
      officialMatch("losers", 6, "L2", "L3", schedule),
      officialMatch("losers", 7, "L1", "W6", schedule),
    ]),
    officialRound("losers", 1, "Losers Bracket — Round 2", [
      officialMatch("losers", 9, "L5", "W7", schedule),
      officialMatch("losers", 10, "L4", "W9", schedule),
    ]),
    officialRound("losers", 2, "Losers Bracket — Final", [
      officialMatch("losers", 11, "L8", "W10", schedule),
    ]),
    officialRound("championship", 0, "Championship", championshipMatches),
  ];
}

function buildGenericOfficialRounds(
  teams: string[],
  opts: OfficialTemplateBuildOptions,
): BracketRound[] {
  const bracketFormat = bracketFormatForChampionshipSeriesStyle(opts.championshipSeriesStyle);
  return generateDoubleEliminationRoundsForFormat(teams, bracketFormat);
}

export const OFFICIAL_TEMPLATES: OfficialTemplate[] = [
  {
    id: "little_league_3_team_de",
    governingBody: "little_league",
    label: "Official 3-team double elimination (Little League)",
    teamCount: 3,
    defaultChampionshipSeriesStyle: "always_scheduled_reset",
    supportedChampionshipSeriesStyles: BOTH_STYLES,
    lockLayout: true,
    pdfTemplateId: "little_league_3_team_de",
    buildRounds: buildThreeTeamOfficialRounds,
  },
  {
    id: "little_league_5_team_de",
    governingBody: "little_league",
    label: "Official 5-team double elimination (Little League)",
    teamCount: 5,
    defaultChampionshipSeriesStyle: "always_scheduled_reset",
    supportedChampionshipSeriesStyles: BOTH_STYLES,
    lockLayout: true,
    pdfTemplateId: "little_league_5_team_de",
    buildRounds: buildFiveTeamOfficialRounds,
  },
  {
    id: "little_league_6_team_de",
    governingBody: "little_league",
    label: "Official 6-team double elimination (Little League)",
    teamCount: 6,
    defaultChampionshipSeriesStyle: "winner_take_all",
    supportedChampionshipSeriesStyles: BOTH_STYLES,
    lockLayout: true,
    pdfTemplateId: "little_league_6_team_de",
    buildRounds: buildSixTeamOfficialRounds,
  },
  {
    id: "little_league_7_team_de",
    governingBody: "little_league",
    label: "Official 7-team double elimination (Little League)",
    teamCount: 7,
    defaultChampionshipSeriesStyle: "always_scheduled_reset",
    supportedChampionshipSeriesStyles: BOTH_STYLES,
    lockLayout: false,
    pdfTemplateId: "little_league_7_team_de",
    buildRounds: buildSevenTeamOfficialRounds,
  },
  {
    id: "little_league_8_team_de",
    governingBody: "little_league",
    label: "Official 8-team double elimination (Little League)",
    teamCount: 8,
    defaultChampionshipSeriesStyle: "always_scheduled_reset",
    supportedChampionshipSeriesStyles: BOTH_STYLES,
    lockLayout: false,
    pdfTemplateId: "little_league_8_team_de",
    buildRounds: buildGenericOfficialRounds,
  },
];

const TEMPLATE_BY_ID = new Map(OFFICIAL_TEMPLATES.map((t) => [t.id, t]));

export function getOfficialTemplate(id: string): OfficialTemplate | undefined {
  return TEMPLATE_BY_ID.get(id as OfficialTemplateId);
}

export function listOfficialTemplates(governingBody?: GoverningBodyId): OfficialTemplate[] {
  if (!governingBody) return [...OFFICIAL_TEMPLATES];
  return OFFICIAL_TEMPLATES.filter((t) => t.governingBody === governingBody);
}

export function defaultOfficialTemplateForNewProject(): OfficialTemplate {
  return TEMPLATE_BY_ID.get("little_league_6_team_de")!;
}

export function resolveOfficialTemplateByPdfId(pdfTemplateId: string): OfficialTemplate | undefined {
  return OFFICIAL_TEMPLATES.find((t) => t.pdfTemplateId === pdfTemplateId);
}

export function placeholderTeamsForOfficialTemplate(template: OfficialTemplate): string[] {
  return placeholderTeamsForCount(template.teamCount);
}

export function specDefaultsFromOfficialTemplate(
  templateId: OfficialTemplateId,
  championshipSeriesStyle?: ChampionshipSeriesStyle,
): Partial<BracketSpec> {
  const template = getOfficialTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown official template: ${templateId}`);
  }
  const style = championshipSeriesStyle ?? template.defaultChampionshipSeriesStyle;
  return {
    governingBody: template.governingBody,
    officialTemplateId: template.id,
    layoutPreference: "official",
    bracketFormat: bracketFormatForChampionshipSeriesStyle(style),
    championshipSeriesStyle: style,
    teams: placeholderTeamsForOfficialTemplate(template),
    rounds: [],
    games: [],
    setupWizardCompleted: false,
    classicDoubleElimLayoutLocked: false,
  };
}

export function buildRoundsFromOfficialTemplate(
  templateId: string,
  teams: string[],
  opts: OfficialTemplateBuildOptions,
): BracketRound[] {
  const template = getOfficialTemplate(templateId);
  if (!template) {
    throw new Error(`Unknown official template: ${templateId}`);
  }
  const trimmed = teams.map((s) => s.trim()).filter(Boolean);
  if (trimmed.length !== template.teamCount) {
    throw new Error(
      `${template.label} requires exactly ${template.teamCount} teams (got ${trimmed.length}).`,
    );
  }
  if (!template.supportedChampionshipSeriesStyles.includes(opts.championshipSeriesStyle)) {
    throw new Error(
      `Championship style "${opts.championshipSeriesStyle}" is not supported for ${template.label}.`,
    );
  }
  return template.buildRounds(trimmed, opts);
}

export function officialTemplateChampionshipLabel(style: ChampionshipSeriesStyle): string {
  return style === "winner_take_all"
    ? "Modified — winner-take-all final (no if-necessary game)"
    : "Standard — grand final + if-necessary game";
}
