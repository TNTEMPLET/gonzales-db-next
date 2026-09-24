import "server-only";

import { summarizeUmpirePayForPark, type DayParkUmpirePay } from "@/lib/admin/umpirePayRows";
import { fetchGames, type Game } from "@/lib/fetchGames";
import prisma from "@/lib/prisma";
import { getAssignrLeagueId, type ContentOrgId } from "@/lib/siteConfig";

export async function loadDirectorParks(org: ContentOrgId): Promise<string[]> {
  const parks = await prisma.schedulePark.findMany({
    where: { organizationId: org, isActive: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return parks.map((park) => park.name);
}

function gameDateKey(game: Game): string {
  const raw = String(game.localized_date || "").trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return "";
}

export async function loadParkDirectorUmpirePay(input: {
  org: ContentOrgId;
  day: string;
  parkName: string;
}): Promise<DayParkUmpirePay[]> {
  const games = await fetchGames({
    startDate: input.day,
    endDate: input.day,
    leagueId: getAssignrLeagueId(input.org),
    limit: 50,
  });
  const thatDay = games.filter((game) => {
    const status = String(game.status || "").trim().toUpperCase();
    if (status === "X" || status === "C") return false;
    return gameDateKey(game) === input.day;
  });
  return summarizeUmpirePayForPark(thatDay, input.parkName);
}
