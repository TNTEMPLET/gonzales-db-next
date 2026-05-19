import type { GcScoreboardEvent } from "@/lib/gamechanger/types";

/** Distinct home/away team names from GameChanger scoreboard events. */
export function collectGcTeamNamesFromEvents(events: GcScoreboardEvent[]): string[] {
  const names = new Set<string>();
  for (const ev of events) {
    const home = ev.home_team.name.trim();
    const away = ev.away_team.name.trim();
    if (home) names.add(home);
    if (away) names.add(away);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "en-US", { numeric: true, sensitivity: "base" }));
}
