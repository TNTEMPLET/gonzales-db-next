import type { CreateGameRequest } from "./types.js";

const GC_SCOREBOARD_API_BASE = "https://api.team-manager.gc.com";

type ScoreboardEvent = {
  id: string;
  start_ts: string;
  home_team: { name: string };
  away_team: { name: string };
};

function normalizeTeamName(value: string): string {
  return value.trim().toLowerCase();
}

function scoreboardDayStartIso(date = new Date()): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function findCreatedEventId(
  widgetId: string,
  request: CreateGameRequest,
  scheduledForIso?: string,
): Promise<string | undefined> {
  const home = normalizeTeamName(request.homeTeam);
  const away = normalizeTeamName(request.awayTeam);
  const targetStart = scheduledForIso ? new Date(scheduledForIso).toISOString() : undefined;
  const dayStart = scoreboardDayStartIso(new Date(scheduledForIso ?? Date.now()));

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const url = new URL(`${GC_SCOREBOARD_API_BASE}/public/widgets/scoreboard/${widgetId}`);
    url.searchParams.set("start", dayStart);

    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) {
      throw new Error(`GameChanger scoreboard lookup failed (${response.status}).`);
    }

    const json = (await response.json()) as {
      data?: { events?: ScoreboardEvent[] };
    };
    const events = json.data?.events ?? [];

    const matches = events.filter((event) => {
      const eventHome = normalizeTeamName(event.home_team.name);
      const eventAway = normalizeTeamName(event.away_team.name);
      return (
        (eventHome === home && eventAway === away) || (eventHome === away && eventAway === home)
      );
    });

    if (matches.length > 0) {
      if (targetStart) {
        const exact = matches.filter(
          (event) => new Date(event.start_ts).toISOString() === targetStart,
        );
        if (exact.length > 0) return exact[exact.length - 1]!.id;
      }
      return matches[matches.length - 1]!.id;
    }

    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  return undefined;
}
