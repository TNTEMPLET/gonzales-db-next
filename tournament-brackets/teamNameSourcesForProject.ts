import { collectGcTeamNamesFromEvents } from "@/lib/gamechanger/collectGcTeamNames";
import { fetchGameChangerScoreboardTeamNamesWindow } from "@/lib/gamechanger/fetchScoreboard";
import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import { collectEditableTeamLabels } from "@/lib/tournament-brackets/bracketTeamRename";
import { parseBracketSpec, type BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  candidateNamesForMapping,
  suggestTeamLabelMappings,
} from "@/lib/tournament-brackets/suggestTeamLabelMappings";
import prisma from "@/lib/prisma";

export type BracketTeamNameSources = {
  bracketLabels: string[];
  gameChangerTeamNames: string[];
  rosterTeamNames: string[];
  candidateNames: string[];
  suggestedMappings: { from: string; to: string }[];
  gameChangerConfigured: boolean;
  gameChangerError?: string;
  rosterAgeGroup?: string;
};

export async function teamNameSourcesForSpec(
  specInput: unknown,
  options: { organizationId: string; seasonYear: number },
): Promise<BracketTeamNameSources> {
  const spec = parseBracketSpec(specInput);
  return teamNameSourcesFromParsedSpec(spec, options);
}

export async function teamNameSourcesFromParsedSpec(
  spec: BracketSpec,
  options: { organizationId: string; seasonYear: number },
): Promise<BracketTeamNameSources> {
  const bracketLabels = collectEditableTeamLabels(spec);
  const rosterAgeGroup = spec.rosterAgeGroup?.trim() || undefined;

  let gameChangerTeamNames: string[] = [];
  let gameChangerConfigured = false;
  let gameChangerError: string | undefined;

  const gcParsed = bracketGameChangerSchema.safeParse(spec.gameChanger);
  if (gcParsed.success) {
    gameChangerConfigured = true;
    try {
      const { events } = await fetchGameChangerScoreboardTeamNamesWindow(gcParsed.data.widgetId);
      gameChangerTeamNames = collectGcTeamNamesFromEvents(events);
    } catch (err: unknown) {
      gameChangerError = err instanceof Error ? err.message : String(err);
    }
  }

  let rosterTeamNames: string[] = [];
  if (rosterAgeGroup) {
    const rows = await prisma.team.findMany({
      where: {
        organizationId: options.organizationId,
        seasonYear: options.seasonYear,
        ageGroup: rosterAgeGroup,
      },
      select: { teamName: true },
      orderBy: { teamName: "asc" },
    });
    rosterTeamNames = rows.map((r) => r.teamName.trim()).filter(Boolean);
  }

  const candidateNames = candidateNamesForMapping(gameChangerTeamNames, rosterTeamNames);
  const suggestedMappings = suggestTeamLabelMappings(bracketLabels, candidateNames);

  return {
    bracketLabels,
    gameChangerTeamNames,
    rosterTeamNames,
    candidateNames,
    suggestedMappings,
    gameChangerConfigured,
    gameChangerError,
    rosterAgeGroup,
  };
}
