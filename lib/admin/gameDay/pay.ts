import { venueMatchesPark } from "@/lib/admin/parkDirectorPark";
import {
  buildUmpireReportRows,
  type DayParkUmpirePay,
  type UmpirePayOptions,
} from "@/lib/admin/umpirePayRows";
import type { Game } from "@/lib/fetchGames";

/** Owed at the park today, summed across the Assignr leagues that were queried. */
export function owedAtParks(
  games: readonly Game[],
  parkNames: readonly string[],
  options?: UmpirePayOptions,
): DayParkUmpirePay[] {
  const names = parkNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return [];
  const byUmpire = new Map<string, DayParkUmpirePay>();
  for (const row of buildUmpireReportRows([...games], options)) {
    if (!names.some((name) => venueMatchesPark(row.park, name))) continue;
    const existing = byUmpire.get(row.umpireId);
    if (!existing) {
      byUmpire.set(row.umpireId, {
        umpireId: row.umpireId,
        name: row.umpireName,
        games: row.games,
        totalPay: row.totalPay,
      });
      continue;
    }
    existing.games += row.games;
    existing.totalPay += row.totalPay;
  }
  return [...byUmpire.values()].sort((a, b) => a.name.localeCompare(b.name) || a.umpireId.localeCompare(b.umpireId));
}

export function mergeOwed(parts: readonly (readonly DayParkUmpirePay[])[]): DayParkUmpirePay[] {
  const byUmpire = new Map<string, DayParkUmpirePay>();
  for (const part of parts) {
    for (const row of part) {
      const existing = byUmpire.get(row.umpireId);
      if (!existing) {
        byUmpire.set(row.umpireId, { ...row });
        continue;
      }
      existing.games += row.games;
      existing.totalPay += row.totalPay;
    }
  }
  return [...byUmpire.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.umpireId.localeCompare(b.umpireId),
  );
}

export function payTotal(rows: readonly { totalPay: number }[]): number {
  return rows.reduce((sum, row) => sum + row.totalPay, 0);
}
