import prisma from "@/lib/prisma";
import { getDefaultAllStarCutoffMonthDayForOrg } from "@/lib/siteConfig";

function deriveAllStarAgeBandFromBirthDate(
  birthDate: Date | null,
  cutoffDate: Date | null,
) {
  if (!birthDate || !cutoffDate) return null;
  let age = cutoffDate.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = cutoffDate.getUTCMonth() - birthDate.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && cutoffDate.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }
  if (!Number.isInteger(age) || age < 4 || age > 18) return null;
  return `${age}U`;
}

async function main() {
  const seasons = await prisma.team.findMany({
    select: { organizationId: true, seasonYear: true },
    distinct: ["organizationId", "seasonYear"],
  });

  const cutoffMap = new Map<string, Date>();
  for (const row of seasons) {
    if (row.organizationId !== "gonzales" && row.organizationId !== "ascension") {
      continue;
    }

    const override = await prisma.teamAllStarAgeCutoff.findUnique({
      where: {
        organizationId_seasonYear: {
          organizationId: row.organizationId,
          seasonYear: row.seasonYear,
        },
      },
      select: { cutoffDate: true },
    });
    const fallback = (() => {
      const { month, day } = getDefaultAllStarCutoffMonthDayForOrg(row.organizationId);
      return new Date(Date.UTC(row.seasonYear, month - 1, day, 0, 0, 0, 0));
    })();

    cutoffMap.set(
      `${row.organizationId}:${row.seasonYear}`,
      override?.cutoffDate ?? fallback,
    );
  }

  const players = await prisma.teamPlayer.findMany({
    select: {
      id: true,
      birthDate: true,
      allStarAgeBand: true,
      team: {
        select: {
          organizationId: true,
          seasonYear: true,
        },
      },
    },
  });

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;

  for (const player of players) {
    scanned += 1;
    const org = player.team.organizationId;
    if (org !== "gonzales" && org !== "ascension") {
      unchanged += 1;
      continue;
    }

    const cutoffDate = cutoffMap.get(`${org}:${player.team.seasonYear}`) ?? null;
    const nextAgeBand = deriveAllStarAgeBandFromBirthDate(player.birthDate, cutoffDate);
    if ((player.allStarAgeBand ?? null) === nextAgeBand) {
      unchanged += 1;
      continue;
    }

    await prisma.teamPlayer.update({
      where: { id: player.id },
      data: { allStarAgeBand: nextAgeBand },
    });
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        updated,
        unchanged,
        seasonsWithResolvedCutoff: cutoffMap.size,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
