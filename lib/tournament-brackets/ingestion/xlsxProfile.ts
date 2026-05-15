import { parseTournamentScheduleBuffer } from "@/lib/assignr/tournamentScheduleParser";

import { makeGameId, type IngestionResult } from "@/lib/tournament-brackets/ingestion/types";

export function ingestXlsxTournamentSchedule(
  buffer: ArrayBuffer,
  seasonYear: number,
): IngestionResult {
  const warnings: string[] = [];
  try {
    const drafts = parseTournamentScheduleBuffer(buffer, seasonYear);
    if (drafts.length === 0) {
      warnings.push(
        "No tournament games found in this spreadsheet using the AP Baseball tournament column layout.",
      );
      return { warnings, games: [] };
    }
    const games = drafts.map((d, i) => ({
      id: makeGameId("xlsx", i),
      label: `Game ${d.sourceGameNumber}`,
      dateLabel: d.dateLabel,
      time: d.time,
      venue: d.sourcePark,
      field: d.sourceField,
      homeTeam: d.homeTeam,
      awayTeam: d.awayTeam,
      tournament: d.sourceTournament,
      gameNumber: d.sourceGameNumber,
    }));
    return { warnings, games };
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : String(e));
    return { warnings, games: [] };
  }
}
