import "server-only";

import prisma from "@/lib/prisma";
import {
  finalStandingsLabel,
  springPublicPhase,
  type CompletedSeasonRecord,
  type SpringContentOrgId,
} from "@/lib/publicSeason/offSeason";
import { getSeasonConfigForOrg, leagueCalendarDate } from "@/lib/seasonConfig";

function isoDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/**
 * Prior seasons already on file. Only called before the configured window,
 * so Fall Ball and in-season Spring requests never hit this query.
 */
export async function loadCompletedPublicSeasons(
  org: SpringContentOrgId,
  asOf: Date = new Date(),
): Promise<CompletedSeasonRecord[]> {
  const config = getSeasonConfigForOrg(org);
  const day = leagueCalendarDate(asOf);
  try {
    const rows = await prisma.scheduleSeason.findMany({
      where: { organizationId: org, seasonYear: { lt: config.year } },
      orderBy: [{ seasonYear: "desc" }, { endsOn: "desc" }],
      select: { name: true, seasonYear: true, endsOn: true, status: true },
    });
    return rows.flatMap((row) => {
      const endDate = isoDate(row.endsOn);
      const finished =
        row.status === "LOCKED" ||
        row.status === "ARCHIVED" ||
        (endDate != null && endDate < day && endDate < config.startDate);
      if (!finished) return [];
      const label = row.name.trim();
      if (!label) return [];
      return [{ label, year: row.seasonYear, endDate }];
    });
  } catch (err) {
    console.error(
      `loadCompletedPublicSeasons(${org}) failed:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/** Label for the public final-standings link, or null when none should show. */
export async function resolvePublicStandingsLabel(
  org: SpringContentOrgId,
  asOf: Date = new Date(),
): Promise<string | null> {
  const phase = springPublicPhase(org, asOf);
  if (phase === "after") return finalStandingsLabel(org, asOf);
  if (phase !== "before") return null;
  const seasons = await loadCompletedPublicSeasons(org, asOf);
  return finalStandingsLabel(org, asOf, seasons);
}
