import type { Game } from "@/lib/fetchGames";
import type { AdminAssignrScope } from "@/lib/admin/assignrOrgScope";
import { inferContentOrgFromGame } from "@/lib/admin/assignrOrgScope";
import type { ContentOrgId } from "@/lib/siteConfig";
import { getDefaultContentOrg } from "@/lib/siteConfig";

export type ScoreEntryGame = {
  gameExternalId: string;
  organizationId: ContentOrgId;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string | null;
  status: string;
  venue: string | null;
  subvenue: string | null;
};

function toIsoDate(source?: string) {
  if (!source) return null;
  const parsed = new Date(source);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed.toISOString();
}

/**
 * Builds the list of past games eligible for score entry. Time cutoff lives here
 * so admin page render stays free of impure calls flagged by react-hooks/purity.
 */
export function buildScoreEntryGames(
  games: Game[],
  scope: AdminAssignrScope,
): ScoreEntryGame[] {
  const now = Date.now();
  const fallbackOrg = scope === "all" ? getDefaultContentOrg() : scope;
  return games
    .map((game) => {
      const gameDate = toIsoDate(game.start_time || game.localized_date);
      return {
        gameExternalId: String(game.id),
        organizationId: inferContentOrgFromGame(game) ?? fallbackOrg,
        ageGroup: (game.age_group || "Unassigned").trim() || "Unassigned",
        homeTeam: game.home_team?.trim() || "Home Team",
        awayTeam: game.away_team?.trim() || "Away Team",
        gameDate,
        status: game.status?.trim() || "Scheduled",
        venue:
          game._embedded?.venue?.name ??
          (game.venue as string | undefined) ??
          null,
        subvenue: game.subvenue ?? null,
      };
    })
    .filter((game) => {
      if (!game.gameDate) return false;
      if (new Date(game.gameDate).valueOf() > now) return false;
      return game.status === "A" || game.status === "C";
    });
}
