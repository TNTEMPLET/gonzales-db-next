import "server-only";

import { buildParishFieldPrepPdf } from "@/lib/admin/parishFieldPrepReport";
import { parseSeasonDateWindows } from "@/lib/scheduler/seasonWindows";
import { dateKey } from "@/lib/scheduler/validation";
import { getOrgDisplayName, type ContentOrgId } from "@/lib/siteConfig";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import prisma from "@/lib/prisma";

export async function loadParishFieldPrepReport(organizationId: string) {
  const season = await prisma.scheduleSeason.findFirst({
    where: { organizationId },
    orderBy: [{ seasonYear: "desc" }, { updatedAt: "desc" }],
  });
  if (!season) {
    throw new Error("No scheduler season found for this organization");
  }
  const parks = await prisma.schedulePark.findMany({
    where: { organizationId, isActive: true },
    include: {
      fields: { where: { isActive: true }, orderBy: { name: "asc" } },
      availabilities: true,
    },
    orderBy: { name: "asc" },
  });
  const games = await prisma.scheduleDraftGame.findMany({
    where: { organizationId, seasonId: season.id, NOT: { status: "CANCELED" } },
    select: {
      fieldId: true,
      gameDate: true,
      startTime: true,
      division: true,
      homeTeamName: true,
      awayTeamName: true,
    },
  });
  const seasonCfg = getSeasonConfigForOrg(organizationId as ContentOrgId);
  const seasonStart = season.startsOn ? dateKey(season.startsOn) : seasonCfg.startDate;
  const seasonEnd = season.endsOn ? dateKey(season.endsOn) : seasonCfg.endDate;
  const windows = parseSeasonDateWindows(season.settings, seasonStart, seasonEnd);
  const orgName = getOrgDisplayName(organizationId as ContentOrgId);
  const seasonLabel = seasonCfg.label || season.name;
  const built = buildParishFieldPrepPdf({
    orgName,
    seasonName: season.name,
    gamesWindow: `${windows.gamesStartsOn} – ${windows.gamesEndsOn}`,
    parks: parks.map((park) => ({
      id: park.id,
      name: park.name,
      shortName: park.shortName,
      fields: park.fields.map((field) => ({
        id: field.id,
        parkId: field.parkId,
        name: field.name,
        shortName: field.shortName,
        isActive: field.isActive,
      })),
      availabilities: park.availabilities.map((row) => ({
        availabilityType: row.availabilityType === "BLACKOUT" ? "BLACKOUT" : "AVAILABLE",
        date: row.date,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        fieldId: row.fieldId,
        parkId: row.parkId,
        notes: row.notes,
      })),
    })),
    games,
    gamesStartsOn: windows.gamesStartsOn,
    gamesEndsOn: windows.gamesEndsOn,
  });
  return { ...built, orgName, seasonName: season.name, seasonLabel };
}
