import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { bracketFormatForChampionshipSeriesStyle, type ChampionshipSeriesStyle } from "@/lib/tournament-brackets/bracketFormat";
import { extractPdfTextForIngest } from "@/lib/tournament-brackets/ingestion/extractPdfTextForIngest";
import { buildRoundsFromPdfIngest } from "@/lib/tournament-brackets/ingestion/buildRoundsFromPdfIngest";
import { parsePdfBracketTemplate } from "@/lib/tournament-brackets/ingestion/parsePdfBracketTemplate";
import { extractVisualPdfTeams } from "@/lib/tournament-brackets/ingestion/parsePdfVisualBracketInfo";
import type { IngestionResult } from "@/lib/tournament-brackets/ingestion/types";
import { parsePdfTournamentInfo } from "@/lib/tournament-brackets/ingestion/parsePdfTournamentInfo";
import { resolveOfficialTemplateByPdfId } from "@/lib/tournament-brackets/officialTemplates";
import type { BracketPdfVisualReaderMode } from "@/lib/tournament-brackets/ingestion/bracketPdfVisualReaderConfig";

/** Build a partial spec patch for the guided setup wizard from a recognized PDF template. */
export function buildPdfWizardSpecPatch(
  match: NonNullable<ReturnType<typeof parsePdfBracketTemplate>>,
  options?: {
    artifactUrl?: string;
    rounds?: BracketSpec["rounds"];
    gamesBuilt?: number;
    scheduleLinesApplied?: number;
    routingVerified?: boolean;
    championshipSeriesStyle?: ChampionshipSeriesStyle;
    textExtractionSource?: string;
    rawText?: string;
  },
): Record<string, unknown> {
  const official = resolveOfficialTemplateByPdfId(match.templateId);
  const resolvedStyle = options?.championshipSeriesStyle ?? match.championshipSeriesStyle;
  const patch: Record<string, unknown> = {
    bracketFormat: resolvedStyle
      ? bracketFormatForChampionshipSeriesStyle(resolvedStyle)
      : match.bracketFormat,
    governingBody: official?.governingBody ?? "little_league",
    officialTemplateId: official?.id,
    layoutPreference: official ? "official" : "connected_columns",
    teams: match.placeholderTeams,
    setupWizardCompleted: false,
    pdfIngestHints: {
      templateId: match.templateId,
      templateLabel: match.templateLabel,
      teamCount: match.teamCount,
      ...(options?.artifactUrl ? { artifactUrl: options.artifactUrl } : {}),
      importedAt: new Date().toISOString(),
      ...(options?.gamesBuilt != null ? { gamesBuilt: options.gamesBuilt } : {}),
      ...(options?.scheduleLinesApplied != null
        ? { scheduleLinesApplied: options.scheduleLinesApplied }
        : {}),
      ...(options?.routingVerified != null ? { routingVerified: options.routingVerified } : {}),
      ...(options?.textExtractionSource ? { textExtractionSource: options.textExtractionSource } : {}),
      roundsBuilt: Boolean(options?.rounds?.length),
    },
  };
  if (options?.rounds && options.rounds.length > 0) {
    patch.rounds = options.rounds;
    patch.championTeamName = null;
    patch.thirdPlaceGame = null;
    patch.setupWizardCompleted = false;
    patch.classicDoubleElimLayoutLocked = true;
  }
  if (match.divisionLabel) {
    patch.divisionLabel = match.divisionLabel;
    patch.championAgeGroupLabel = match.divisionLabel;
  }
  if (resolvedStyle) {
    patch.championshipSeriesStyle = resolvedStyle;
  }
  const tournamentInfo = options?.rawText ? parsePdfTournamentInfo(options.rawText) : undefined;
  if (tournamentInfo) {
    patch.tournamentInfo = tournamentInfo;
  }
  return patch;
}

export async function ingestPdfBracket(
  buffer: ArrayBuffer,
  opts?: { visualReaderMode?: BracketPdfVisualReaderMode },
): Promise<IngestionResult> {
  const warnings: string[] = [];
  let rawText = "";
  let visualText = "";
  let extractionSource: string | undefined;
  try {
    const extracted = await extractPdfTextForIngest(buffer, { mode: opts?.visualReaderMode });
    rawText = extracted.text;
    visualText = extracted.visionText?.trim() || extracted.ocrText?.trim() || rawText;
    extractionSource = extracted.source;
    warnings.push(...extracted.warnings);
    if (extracted.source !== "embedded" && extracted.source !== "heuristic") {
      warnings.push(`Bracket text source: ${extracted.source}.`);
    }
  } catch (e) {
    warnings.push(`Could not extract PDF text: ${e instanceof Error ? e.message : String(e)}`);
    return { warnings, games: [], rawText };
  }

  if (!rawText.trim()) {
    warnings.push(
      "PDF loaded but no extractable text was found. This may be a scanned image — enter teams manually in the setup wizard, or export an XLSX schedule if you only need game times.",
    );
    return { warnings, games: [], rawText };
  }

  const template = parsePdfBracketTemplate(rawText);
  if (!template) {
    warnings.push(
      "PDF text was extracted but no known bracket template was detected. Use the setup wizard to choose format and teams, or import an XLSX for schedule rows.",
    );
    return { warnings, games: [], rawText };
  }

  const visualTeams = extractVisualPdfTeams(visualText, template);
  const effectiveTemplate = visualTeams
    ? { ...template, placeholderTeams: visualTeams }
    : template;
  if (visualTeams) {
    warnings.push(
      `Read ${visualTeams.length} team name${visualTeams.length === 1 ? "" : "s"} from the PDF bracket: ${visualTeams.join(", ")}.`,
    );
  }

  const roundsResult = buildRoundsFromPdfIngest(effectiveTemplate, rawText);
  warnings.push(...roundsResult.warnings);

  const specPatch = buildPdfWizardSpecPatch(effectiveTemplate, {
    rounds: roundsResult.rounds,
    gamesBuilt: roundsResult.gamesBuilt,
    scheduleLinesApplied: roundsResult.scheduleLinesApplied,
    routingVerified: roundsResult.routingVerified,
    championshipSeriesStyle: roundsResult.championshipSeriesStyle,
    textExtractionSource: extractionSource,
    rawText: visualText,
  });

  if (roundsResult.gamesBuilt > 0) {
    warnings.unshift(
      visualTeams
        ? `Detected "${template.templateLabel}" and built ${roundsResult.gamesBuilt} games using team names read from the PDF.`
        : `Detected "${template.templateLabel}" and built ${roundsResult.gamesBuilt} games from PDF routing. Replace placeholder teams (A–${template.placeholderTeams.at(-1)}) in Team name mapping or guided setup, then save scores as games are played.`,
    );
  } else {
    warnings.push(
      visualTeams
        ? `Detected "${template.templateLabel}" (${template.bracketFormat.replace(/_/g, " ")}). Guided setup was pre-filled with team names read from the PDF.`
        : `Detected "${template.templateLabel}" (${template.bracketFormat.replace(/_/g, " ")}). Guided setup was pre-filled with ${template.teamCount} placeholder teams — replace A–${template.placeholderTeams.at(-1)} with real team names, then build the bracket.`,
    );
  }

  return {
    warnings,
    games: [],
    rawText,
    pdfTemplate: effectiveTemplate,
    specPatch,
    roundsBuilt: roundsResult.gamesBuilt,
  };
}
