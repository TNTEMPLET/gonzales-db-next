import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAssignrGamesCsvFromDrafts } from "@/lib/assignr/gamesImportCsv";
import {
  buildImportCatalog,
  buildSuggestedMappings,
} from "@/lib/assignr/gamesImportService";
import { fieldMappingKey } from "@/lib/assignr/gamesImportTypes";
import { parseTournamentScheduleBuffer } from "@/lib/assignr/tournamentScheduleParser";
import { fetchGames } from "@/lib/fetchGames";
import { getAssignrLeagueId } from "@/lib/siteConfig";

const seasonYear = 2026;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = join(
  repoRoot,
  "lib/assignr/__fixtures__/eoy-tourney-schedule.csv",
);
const outputDir = join(repoRoot, "exports");
const outputPath = join(outputDir, "assignr-games-eoy-tourney-2026.csv");

async function main() {
  const buffer = readFileSync(fixturePath);
  const drafts = parseTournamentScheduleBuffer(buffer.buffer, seasonYear);
  const leagueId = getAssignrLeagueId("gonzales");
  const games = await fetchGames({
    startDate: `${seasonYear}-01-01`,
    endDate: `${seasonYear}-12-31`,
    leagueId,
  });
  const catalog = buildImportCatalog(games);
  const suggestions = buildSuggestedMappings({
    drafts,
    ageGroups: catalog.ageGroups,
    venues: catalog.venues,
    venueCatalog: catalog.venueCatalog,
  });

  const manualAgeGroupMappings: Record<string, string> = {
    "9 Year Old Diamond City Tournament": "9U DYB",
    "10 Year Old Diamond City Tournament": "10U DYB",
    "11/12 Year Old Diamond CityTournament": "12U DYB",
    "6 Year Old Coaches Pitch Parish Tournament": "6U CP",
    "7 Year Old Coaches Pitch Parish Tournament": "7U CP",
    "8 Year Old Coaches Pitch Parish Tournament": "8U CP",
    "13-14 Year Old DBB Parish Tournament": "14U DBB",
    "15-17 Year Old Dixie Pre Majors Parish Tournament": "16U DBB",
  };

  const ageGroupMappings = {
    ...suggestions.ageGroupMappings,
    ...Object.fromEntries(
      Object.entries(manualAgeGroupMappings).map(([key, value]) => {
        const exact =
          catalog.ageGroups.find(
            (option) => option.trim().toLowerCase() === value.toLowerCase(),
          ) ?? value;
        return [key, exact];
      }),
    ),
  };

  const parkMappings = {
  ...suggestions.parkMappings,
  TEEJOE: suggestions.parkMappings.TEEJOE ?? "Tee-Joe Park",
  STEVENS: suggestions.parkMappings.STEVENS ?? "Stevens Park",
  CLOUATRE: suggestions.parkMappings.CLOUATRE ?? "Clouatre Park",
  };

  const fieldMappings = { ...suggestions.fieldMappings };
  const fieldDefaults: Array<[string, string, string]> = [
    ["TEEJOE", "Aldridge (1)", "Aldridge 1"],
    ["TEEJOE", "Bourque (2)", "Bourque 2"],
    ["TEEJOE", "Patterson", "Patterson"],
    ["TEEJOE", "Berthelot", "Berthelot"],
    ["STEVENS", "Stevens 5", "Stevens 5"],
    ["STEVENS", "1", "1"],
    ["STEVENS", "2", "2"],
    ["STEVENS", "3", "3"],
    ["STEVENS", "4", "4"],
    ["STEVENS", "6", "6"],
    ["CLOUATRE", "Clouatre 1", "Clouatre 1"],
    ["CLOUATRE", "Clouatre 2", "Clouatre 2"],
  ];

  for (const [park, field, subVenue] of fieldDefaults) {
    const key = fieldMappingKey(park, field);
    if (!fieldMappings[key]) {
      const scoped = catalog.venueCatalog.find(
        (entry) =>
          entry.subVenue.trim().toLowerCase() === subVenue.toLowerCase(),
      );
      fieldMappings[key] = scoped?.subVenue ?? subVenue;
    }
  }

  const { csv, exportedCount, skippedCount } = buildAssignrGamesCsvFromDrafts(
    drafts,
    {
      ageGroupMappings,
      parkMappings,
      fieldMappings,
    },
    seasonYear,
  );

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, csv, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        parsedCount: drafts.length,
        exportedCount,
        skippedCount,
        ageGroupMappings,
        parkMappings,
        fieldMappings,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
