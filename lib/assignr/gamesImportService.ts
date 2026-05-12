import type { Game } from "@/lib/fetchGames";

import {
  suggestAgeGroupForTournament,
  suggestParkVenue,
} from "@/lib/assignr/gamesImportAliases";
import type { TournamentGameDraft } from "@/lib/assignr/gamesImportTypes";
import { fieldMappingKey } from "@/lib/assignr/gamesImportTypes";
import {
  buildSuggestedFieldMappings,
  buildVenueCatalog,
  listDistinctVenues,
} from "@/lib/assignr/scheduleVenueCatalog";

export function parseSeasonYear(value: FormDataEntryValue | string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return new Date().getFullYear();
  const year = Number.parseInt(raw, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return new Date().getFullYear();
  }
  return year;
}

export function parseJsonRecord(value: FormDataEntryValue | unknown) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const record: Record<string, string> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry === "string" && entry.trim()) {
        record[key] = entry.trim();
      }
    }
    return record;
  } catch {
    return {};
  }
}

export function collectDistinctTournaments(drafts: TournamentGameDraft[]) {
  return Array.from(
    new Set(drafts.map((draft) => draft.sourceTournament.trim()).filter(Boolean)),
  ).sort();
}

export function collectDistinctParks(drafts: TournamentGameDraft[]) {
  return Array.from(
    new Set(drafts.map((draft) => draft.sourcePark.trim()).filter(Boolean)),
  ).sort();
}

export function collectDistinctFields(drafts: TournamentGameDraft[]) {
  const seen = new Set<string>();
  const fields: Array<{ sourcePark: string; sourceField: string; key: string }> =
    [];

  for (const draft of drafts) {
    const sourcePark = draft.sourcePark.trim();
    const sourceField = draft.sourceField.trim();
    if (!sourceField) continue;
    const key = fieldMappingKey(sourcePark, sourceField);
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ sourcePark, sourceField, key });
  }

  return fields.sort((a, b) => a.key.localeCompare(b.key));
}

export function buildImportCatalog(games: Game[]) {
  const venueCatalog = buildVenueCatalog(games);
  const ageGroups = Array.from(
    new Set(
      games
        .map((game) =>
          typeof game.age_group === "string" ? game.age_group.trim() : "",
        )
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return {
    ageGroups,
    venues: listDistinctVenues(venueCatalog),
    venueCatalog,
  };
}

export function buildSuggestedMappings(params: {
  drafts: TournamentGameDraft[];
  ageGroups: string[];
  venues: string[];
  venueCatalog: ReturnType<typeof buildVenueCatalog>;
}) {
  const ageGroupMappings: Record<string, string> = {};
  for (const tournament of collectDistinctTournaments(params.drafts)) {
    const suggestion = suggestAgeGroupForTournament(tournament, params.ageGroups);
    if (suggestion) {
      ageGroupMappings[tournament] = suggestion;
    }
  }

  const parkMappings: Record<string, string> = {};
  for (const park of collectDistinctParks(params.drafts)) {
    const suggestion = suggestParkVenue(park, params.venues);
    if (suggestion) {
      parkMappings[park] = suggestion;
    }
  }

  const fieldMappings = buildSuggestedFieldMappings({
    drafts: params.drafts,
    parkMappings,
    catalog: params.venueCatalog,
  });

  return {
    ageGroupMappings,
    parkMappings,
    fieldMappings,
  };
}

export function serializeDraftForPreview(draft: TournamentGameDraft) {
  return {
    sourceTournament: draft.sourceTournament,
    sourcePark: draft.sourcePark,
    sourceField: draft.sourceField,
    dateLabel: draft.dateLabel,
    time: draft.time,
    homeTeam: draft.homeTeam,
    awayTeam: draft.awayTeam,
    sourceGameNumber: draft.sourceGameNumber,
    sourceRow: draft.sourceRow,
    sourceColumn: draft.sourceColumn,
    fieldKey: fieldMappingKey(draft.sourcePark, draft.sourceField),
  };
}
