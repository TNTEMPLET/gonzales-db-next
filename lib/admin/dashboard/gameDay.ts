import { leagueCalendarDate, leagueClockHm } from "@/lib/seasonConfig";
import type { ContentOrgId } from "@/lib/siteConfig";

export type GameDayPark = {
  name: string;
  gamesToday: number;
};

export type GameDayStatus = {
  organizationId: ContentOrgId;
  organizationLabel: string;
  parks: GameDayPark[];
  allParksOut: boolean;
  rainedOutParks: string[];
  throughLabel: string | null;
};

export type GameDayRainout = {
  allParksOut: boolean;
  parks: string[];
  /** Central calendar date the alert still covers, YYYY-MM-DD. */
  throughDate: string;
};

export function endOfCentralDay(asOf: Date): Date {
  const day = leagueCalendarDate(asOf);
  const start = Date.parse(`${day}T00:00:00.000Z`);
  for (let minute = 0; minute <= 40 * 60; minute += 1) {
    const candidate = new Date(start + minute * 60_000);
    if (leagueCalendarDate(candidate) === day && leagueClockHm(candidate) === "23:59") {
      return new Date(candidate.getTime() + 59_000);
    }
  }
  throw new Error(`No Central end of day for ${day}`);
}

export function gameIsRainedOut(
  game: { dateKey: string; parkName: string; canceled?: boolean },
  rainout: GameDayRainout | null | undefined,
  today: string,
): boolean {
  if (!rainout || game.canceled) return false;
  if (game.dateKey < today || game.dateKey > rainout.throughDate) return false;
  if (rainout.allParksOut) return true;
  const needle = game.parkName.trim().toLowerCase();
  if (!needle) return false;
  return rainout.parks.some((park) => park.trim().toLowerCase() === needle);
}

export function rainoutChipValue(
  rainout: GameDayRainout | null | undefined,
  fallbackCount = 0,
): { value: string; active: boolean } {
  if (rainout && (rainout.allParksOut || rainout.parks.length > 0)) {
    if (rainout.allParksOut) return { value: "All parks", active: true };
    if (rainout.parks.length === 1) return { value: rainout.parks[0] || "1 park", active: true };
    return { value: `${rainout.parks.length} parks`, active: true };
  }
  if (fallbackCount > 0) return { value: `${fallbackCount} active`, active: true };
  return { value: "Clear", active: false };
}
