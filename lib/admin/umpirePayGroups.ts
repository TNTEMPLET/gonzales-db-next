const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Noon local so "Sep 8, 2026" does not shift weekday across a UTC midnight. */
export function dateLabelSortValue(label: string): number {
  const parsed = Date.parse(`${label} 12:00:00`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function weekdayName(dateLabel: string): string {
  const parsed = Date.parse(`${dateLabel} 12:00:00`);
  if (Number.isNaN(parsed)) return "";
  return WEEKDAYS[new Date(parsed).getDay()] ?? "";
}

export type PayByParkGame = {
  date: string;
  time: string;
  venue: string;
  gamePayTotal: number;
};

export type PayByParkDay<T extends PayByParkGame> = {
  date: string;
  dayName: string;
  totalPay: number;
  games: T[];
};

export type PayByParkGroup<T extends PayByParkGame> = {
  park: string;
  totalPay: number;
  days: PayByParkDay<T>[];
};

/** Park → chronological day (Monday, Tuesday, …) → games. */
export function groupPayByPark<T extends PayByParkGame>(rows: T[]): PayByParkGroup<T>[] {
  const byPark = new Map<string, Map<string, T[]>>();
  for (const row of rows) {
    const park = row.venue.trim() || "Unknown Venue";
    if (!byPark.has(park)) byPark.set(park, new Map());
    const byDate = byPark.get(park)!;
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date)!.push(row);
  }

  return Array.from(byPark.entries())
    .map(([park, byDate]) => {
      const days: PayByParkDay<T>[] = Array.from(byDate.entries())
        .map(([date, games]) => ({
          date,
          dayName: weekdayName(date),
          totalPay: games.reduce((sum, game) => sum + game.gamePayTotal, 0),
          games: [...games].sort((a, b) => a.time.localeCompare(b.time)),
        }))
        .sort((a, b) => dateLabelSortValue(a.date) - dateLabelSortValue(b.date));
      return {
        park,
        days,
        totalPay: days.reduce((sum, day) => sum + day.totalPay, 0),
      };
    })
    .sort((a, b) => a.park.localeCompare(b.park));
}
