import prisma from "@/lib/prisma";

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeJersey(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "tbd" || normalized === "n/a" || normalized === "na") {
    return "";
  }
  return normalized;
}

function key(fullName: string, team: string, jerseyNumber: string | null | undefined) {
  return `${normalizeText(fullName)}::${normalizeText(team)}::${normalizeJersey(jerseyNumber)}`;
}

async function main() {
  const cycleId = process.argv[2];
  if (!cycleId) {
    throw new Error("Usage: npx tsx scripts/verify-cycle-candidates.ts <cycleId>");
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      ageGroup: true,
      allStarAgeGroupLabel: true,
      title: true,
    },
  });
  if (!cycle) throw new Error("Cycle not found");

  const expectedPlayers = await prisma.teamPlayer.findMany({
    where: {
      team: {
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
      },
      allStarAgeBand: cycle.allStarAgeGroupLabel || undefined,
    },
    select: {
      fullName: true,
      jerseyNumber: true,
      team: { select: { teamName: true } },
    },
    orderBy: [{ team: { teamName: "asc" } }, { fullName: "asc" }],
  });

  const cycleCandidates = await prisma.allStarCandidate.findMany({
    where: { ballotCycleId: cycle.id },
    select: {
      playerFullName: true,
      team: true,
      jerseyNumber: true,
    },
    orderBy: [{ team: "asc" }, { playerFullName: "asc" }],
  });

  const expectedSet = new Set(
    expectedPlayers.map((player) => key(player.fullName, player.team.teamName, player.jerseyNumber)),
  );
  const candidateSet = new Set(
    cycleCandidates.map((candidate) =>
      key(candidate.playerFullName, candidate.team, candidate.jerseyNumber),
    ),
  );

  const missingFromCandidates = Array.from(expectedSet).filter((item) => !candidateSet.has(item));
  const extraInCandidates = Array.from(candidateSet).filter((item) => !expectedSet.has(item));

  console.log(
    JSON.stringify(
      {
        cycle,
        expectedCount: expectedPlayers.length,
        candidateCount: cycleCandidates.length,
        missingFromCandidatesCount: missingFromCandidates.length,
        extraInCandidatesCount: extraInCandidates.length,
        sampleMissing: missingFromCandidates.slice(0, 10),
        sampleExtra: extraInCandidates.slice(0, 10),
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
