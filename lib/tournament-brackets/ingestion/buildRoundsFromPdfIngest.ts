import type { BracketRound } from "@/lib/tournament-brackets/bracketSpec";
import { generateDoubleEliminationRoundsForFormat } from "@/lib/tournament-brackets/generateDoubleElimFromTeams";
import { generateSingleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateSingleElimFromTeams";
import {
  bracketFormatForChampionshipSeriesStyle,
  type ChampionshipSeriesStyle,
  isDoubleEliminationFormat,
} from "@/lib/tournament-brackets/bracketFormat";
import {
  parsePdfGameFeederSlots,
  parsePdfGameSchedule,
  pdfFeedersMatchLittleLeagueSixTeamDe,
  inferSixTeamChampionshipSeriesStyleFromFeeders,
} from "@/lib/tournament-brackets/ingestion/parsePdfGameRouting";
import type { PdfBracketTemplateMatch } from "@/lib/tournament-brackets/ingestion/parsePdfBracketTemplate";
import {
  buildRoundsFromOfficialTemplate,
  resolveOfficialTemplateByPdfId,
} from "@/lib/tournament-brackets/officialTemplates";

export type PdfRoundsBuildResult = {
  rounds: BracketRound[];
  warnings: string[];
  gamesBuilt: number;
  scheduleLinesApplied: number;
  routingVerified: boolean;
  championshipSeriesStyle?: ChampionshipSeriesStyle;
};

/**
 * Phase 2: build structured `rounds` from a recognized PDF template plus extracted routing/schedule text.
 */
export function buildRoundsFromPdfIngest(
  template: PdfBracketTemplateMatch,
  rawText: string,
): PdfRoundsBuildResult {
  const warnings: string[] = [];
  const scheduleByGame = parsePdfGameSchedule(rawText);
  const feederSlots = parsePdfGameFeederSlots(rawText);

  const official = resolveOfficialTemplateByPdfId(template.templateId);
  if (official) {
    let style =
      template.championshipSeriesStyle ??
      official.defaultChampionshipSeriesStyle;

    if (template.templateId === "little_league_6_team_de" && feederSlots.length > 0) {
      const inferred = inferSixTeamChampionshipSeriesStyleFromFeeders(feederSlots);
      if (inferred) style = inferred;
    }

    const routingVerified =
      template.templateId === "little_league_6_team_de"
        ? pdfFeedersMatchLittleLeagueSixTeamDe(feederSlots)
        : false;

    if (template.templateId === "little_league_6_team_de") {
      if (!routingVerified && feederSlots.length > 0) {
        warnings.push(
          "PDF game routing differed slightly from the standard 6-team template; built the official Little League game tree anyway.",
        );
      } else if (feederSlots.length === 0) {
        warnings.push(
          "No game routing text found in the PDF; built the standard 6-team Little League game tree.",
        );
      }
    }

    const rounds = buildRoundsFromOfficialTemplate(official.id, template.placeholderTeams, {
      championshipSeriesStyle: style,
      scheduleByGame,
    });
    const gamesBuilt = rounds.flatMap((r) => r.matches).filter((m) => m.officialGameNumber).length;
    const scheduleLinesApplied = [...scheduleByGame.keys()].filter((n) => n >= 1 && n <= gamesBuilt).length;

    if (scheduleLinesApplied > 0) {
      warnings.push(
        `Applied schedule lines from the PDF to ${scheduleLinesApplied} game${scheduleLinesApplied === 1 ? "" : "s"}.`,
      );
    } else if (official.teamCount <= 6) {
      warnings.push(
        "No game schedule lines were found in the PDF — add times in Bracket structure or re-export with Game Info filled in.",
      );
    }

    return {
      rounds,
      warnings,
      gamesBuilt,
      scheduleLinesApplied,
      routingVerified,
      championshipSeriesStyle: style,
    };
  }

  // Fallback: generic auto-generator for other recognized templates.
  try {
    if (isDoubleEliminationFormat(template.bracketFormat)) {
      const rounds = generateDoubleEliminationRoundsForFormat(
        template.placeholderTeams,
        template.bracketFormat,
      );
      const gamesBuilt = rounds.flatMap((r) => r.matches).filter((m) => m.officialGameNumber).length;
      warnings.push(
        `Built ${gamesBuilt} games using the standard double-elimination generator (PDF routing parse not available for this template yet).`,
      );
      return { rounds, warnings, gamesBuilt, scheduleLinesApplied: 0, routingVerified: false };
    }
    if (template.bracketFormat === "single_elimination") {
      const rounds = generateSingleEliminationRoundsFromTeams(template.placeholderTeams);
      const gamesBuilt = rounds.flatMap((r) => r.matches).length;
      warnings.push(`Built ${gamesBuilt} single-elimination games from the template team count.`);
      return { rounds, warnings, gamesBuilt, scheduleLinesApplied: 0, routingVerified: false };
    }
  } catch (e) {
    warnings.push(
      `Could not auto-build rounds: ${e instanceof Error ? e.message : String(e)}. Complete guided setup to generate the bracket.`,
    );
    return { rounds: [], warnings, gamesBuilt: 0, scheduleLinesApplied: 0, routingVerified: false };
  }

  warnings.push("Round auto-build is not implemented for this template yet.");
  return { rounds: [], warnings, gamesBuilt: 0, scheduleLinesApplied: 0, routingVerified: false };
}
