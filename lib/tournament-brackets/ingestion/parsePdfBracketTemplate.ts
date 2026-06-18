import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { isDoubleEliminationFormat } from "@/lib/tournament-brackets/bracketFormat";

export type PdfBracketTemplateMatch = {
  templateId: string;
  templateLabel: string;
  teamCount: number;
  bracketFormat: BracketSpec["bracketFormat"];
  placeholderTeams: string[];
  divisionLabel?: string;
  championshipSeriesStyle?: BracketSpec["championshipSeriesStyle"];
};

const LITTLE_LEAGUE_BRACKET_RE =
  /(\d{1,2})\s*[- ]?\s*Team\s+Little\s+League\s+Bracket/i;

/** DocHub / LL bracket PDFs embed game ids like `6T-G11-Champion`. */
const GOVERNING_BODY_GAME_ID_RE = /\b(\d{1,2})T-G\d+/i;

const DIVISION_LINE_RE = /^Division:[^\S\r\n]*(.+)$/im;
const SITE_LINE_RE = /^Site\(s\):[^\S\r\n]*(.+)$/im;

function inferTeamCount(text: string): number | null {
  const titleMatch = LITTLE_LEAGUE_BRACKET_RE.exec(text);
  if (titleMatch) {
    const n = Number.parseInt(titleMatch[1] ?? "", 10);
    if (Number.isFinite(n) && n >= 2 && n <= 32) return n;
  }
  const gameIdMatch = GOVERNING_BODY_GAME_ID_RE.exec(text);
  if (gameIdMatch) {
    const n = Number.parseInt(gameIdMatch[1] ?? "", 10);
    if (Number.isFinite(n) && n >= 2 && n <= 32) return n;
  }
  return null;
}

function hasStandardResetGameMarker(text: string, teamCount: number): boolean {
  void teamCount;
  if (/\bif\s+necessary\b/i.test(text)) return true;
  return false;
}

function inferBracketFormat(text: string, teamCount: number): {
  bracketFormat: BracketSpec["bracketFormat"];
  championshipSeriesStyle?: BracketSpec["championshipSeriesStyle"];
} {
  const hasWinners = /winners['']?\s*bracket/i.test(text);
  const hasLosers = /losers['']?\s*bracket/i.test(text);
  const hasChampion = /\bchampion\b/i.test(text);
  const hasDoubleElimLabel = /double\s+elimination/i.test(text);
  const hasLoserRouting =
    /\bloser\s+(?:from|of|to)\s+game\b/i.test(text) ||
    /\bloser\s+to\s+[A-F]\b/i.test(text);

  if ((hasWinners && hasLosers) || hasDoubleElimLabel || hasLoserRouting) {
    if (hasChampion && hasStandardResetGameMarker(text, teamCount)) {
      return {
        bracketFormat: "double_elimination",
        championshipSeriesStyle: "always_scheduled_reset",
      };
    }
    return {
      bracketFormat: "modified_double_elimination",
      championshipSeriesStyle: "winner_take_all",
    };
  }

  return { bracketFormat: "single_elimination" };
}

/** Slot labels A–Z for placeholder team names matching common LL bracket PDFs. */
export function placeholderTeamsForCount(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));
}

/**
 * Detect governing-body bracket PDF templates from extracted text.
 * Returns wizard pre-fill hints when a known template is recognized.
 */
export function parsePdfBracketTemplate(text: string): PdfBracketTemplateMatch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const teamCount = inferTeamCount(trimmed);
  if (!teamCount) return null;

  const hasTitle = LITTLE_LEAGUE_BRACKET_RE.test(trimmed);
  const hasGameIds = GOVERNING_BODY_GAME_ID_RE.test(trimmed);
  if (!hasTitle && !hasGameIds) return null;

  const { bracketFormat, championshipSeriesStyle } = inferBracketFormat(trimmed, teamCount);

  const divisionFromLine = DIVISION_LINE_RE.exec(trimmed)?.[1]?.trim();
  const siteFromLine = SITE_LINE_RE.exec(trimmed)?.[1]?.trim();
  const divisionLabel =
    divisionFromLine && divisionFromLine.length > 0
      ? divisionFromLine
      : siteFromLine && siteFromLine.length > 0
        ? siteFromLine
        : undefined;

  return {
    templateId: `little_league_${teamCount}_team_${isDoubleEliminationFormat(bracketFormat) ? "de" : "se"}`,
    templateLabel: `${teamCount} Team Little League Bracket`,
    teamCount,
    bracketFormat,
    placeholderTeams: placeholderTeamsForCount(teamCount),
    ...(divisionLabel ? { divisionLabel } : {}),
    ...(championshipSeriesStyle ? { championshipSeriesStyle } : {}),
  };
}
