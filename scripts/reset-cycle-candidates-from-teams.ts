import prisma from "@/lib/prisma";
import { importCandidatesFromTeamsForCycle } from "@/lib/allStar/candidates";

async function main() {
  const cycleId = process.argv[2];
  if (!cycleId) {
    throw new Error("Usage: npx tsx scripts/reset-cycle-candidates-from-teams.ts <cycleId>");
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
      allStarAgeGroupId: true,
      allStarAgeGroupLabel: true,
    },
  });
  if (!cycle) throw new Error("Cycle not found");

  const beforeCount = await prisma.allStarCandidate.count({
    where: { ballotCycleId: cycle.id },
  });

  await prisma.$transaction(async (tx) => {
    await tx.allStarCandidate.deleteMany({ where: { ballotCycleId: cycle.id } });
    await importCandidatesFromTeamsForCycle(
      tx,
      {
        id: cycle.id,
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
        allStarAgeGroupId: cycle.allStarAgeGroupId,
        allStarAgeGroupLabel: cycle.allStarAgeGroupLabel,
      },
      "BOTH",
    );
  });

  const afterCount = await prisma.allStarCandidate.count({
    where: { ballotCycleId: cycle.id },
  });

  console.log(
    JSON.stringify(
      {
        cycleId: cycle.id,
        allStarAgeGroupLabel: cycle.allStarAgeGroupLabel,
        beforeCount,
        afterCount,
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
