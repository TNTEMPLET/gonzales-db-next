import type { BracketRound, BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  classicFiveTeamParticipantSlots,
} from "@/lib/tournament-brackets/doubleEliminationClassicLayoutTemplate";
import {
  bracketFormatForChampionshipSeriesStyle,
  type ChampionshipSeriesStyle,
} from "@/lib/tournament-brackets/bracketFormat";
import {
  generateDoubleEliminationRoundsForFormat,
  generateDoubleEliminationRoundsFromTeams,
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

function buildFiveTeamOfficialRounds(
  teams: string[],
  opts: OfficialTemplateBuildOptions,
): BracketRound[] {
  const includeIfNecessary = opts.championshipSeriesStyle === "always_scheduled_reset";
  return generateDoubleEliminationRoundsFromTeams(teams, {
    participantSlots: classicFiveTeamParticipantSlots(teams),
    includeIfNecessaryGame: includeIfNecessary,
  });
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

function buildGenericOfficialRounds(
  teams: string[],
  opts: OfficialTemplateBuildOptions,
): BracketRound[] {
  const bracketFormat = bracketFormatForChampionshipSeriesStyle(opts.championshipSeriesStyle);
  return generateDoubleEliminationRoundsForFormat(teams, bracketFormat);
}

export const OFFICIAL_TEMPLATES: OfficialTemplate[] = [
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
    buildRounds: buildGenericOfficialRounds,
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
