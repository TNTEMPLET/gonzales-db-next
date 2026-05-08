import prisma from "@/lib/prisma";

function parseAgeToken(value: string | null | undefined) {
  const text = String(value || "").toUpperCase();
  const match = text.match(/\b(\d{1,2})U\b/);
  if (!match?.[1]) return null;
  const age = Number.parseInt(match[1], 10);
  if (!Number.isFinite(age) || age < 4 || age > 18) return null;
  return `${age}U`;
}

async function main() {
  const cycles = await prisma.allStarBallotCycle.findMany({
    orderBy: [{ organizationId: "asc" }, { seasonYear: "asc" }, { ageGroup: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
      title: true,
      allStarAgeGroupId: true,
      allStarAgeGroupLabel: true,
      createdAt: true,
    },
  });

  const grouped = new Map<string, typeof cycles>();
  for (const cycle of cycles) {
    const key = `${cycle.organizationId}:${cycle.seasonYear}:${cycle.ageGroup}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(cycle);
    grouped.set(key, bucket);
  }

  let updated = 0;
  let alreadySet = 0;
  let skippedAmbiguous = 0;
  let skippedNoSignal = 0;

  for (const cycle of cycles) {
    if (cycle.allStarAgeGroupId && cycle.allStarAgeGroupLabel) {
      alreadySet += 1;
      continue;
    }

    let inferred = parseAgeToken(cycle.title) ?? null;
    if (!inferred) {
      const key = `${cycle.organizationId}:${cycle.seasonYear}:${cycle.ageGroup}`;
      const siblings = grouped.get(key) ?? [];
      // If this is the only cycle for the org/season/age-group, default to the age-group token.
      if (siblings.length === 1) {
        inferred = parseAgeToken(cycle.ageGroup);
      } else {
        skippedAmbiguous += 1;
        continue;
      }
    }

    if (!inferred) {
      skippedNoSignal += 1;
      continue;
    }

    await prisma.allStarBallotCycle.update({
      where: { id: cycle.id },
      data: {
        allStarAgeGroupId: inferred,
        allStarAgeGroupLabel: inferred,
      },
    });
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        totalCycles: cycles.length,
        updated,
        alreadySet,
        skippedAmbiguous,
        skippedNoSignal,
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
