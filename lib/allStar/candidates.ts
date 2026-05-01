import type { Prisma, PrismaClient } from "@prisma/client";

function formatBibNumber(position: number) {
  return String(position).padStart(3, "0");
}

export async function resequenceCandidateBibNumbers(
  tx: Prisma.TransactionClient | PrismaClient,
  cycleId: string,
) {
  const candidates = await tx.allStarCandidate.findMany({
    where: { ballotCycleId: cycleId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  await Promise.all(
    candidates.map((candidate, index) =>
      tx.allStarCandidate.update({
        where: { id: candidate.id },
        data: { showcaseBibNumber: formatBibNumber(index + 1) },
      }),
    ),
  );
}

type ImportCycleContext = {
  id: string;
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
};

function normalizeCandidateKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeJerseyNumber(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  const lower = normalized.toLowerCase();
  if (!normalized || lower === "tbd" || lower === "n/a" || lower === "na") {
    return "";
  }
  return normalized;
}

export async function importCandidatesFromTeamsForCycle(
  tx: Prisma.TransactionClient | PrismaClient,
  cycle: ImportCycleContext,
) {
  const existingCandidates = await tx.allStarCandidate.findMany({
    where: { ballotCycleId: cycle.id },
    select: { playerFullName: true, team: true, jerseyNumber: true },
  });
  const existingKeys = new Set(
    existingCandidates.map((candidate) =>
      [
        normalizeCandidateKey(candidate.playerFullName),
        normalizeCandidateKey(candidate.team),
        normalizeCandidateKey(normalizeJerseyNumber(candidate.jerseyNumber)),
      ].join("::"),
    ),
  );

  const players = await tx.teamPlayer.findMany({
    where: {
      team: {
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
      },
    },
    select: {
      fullName: true,
      jerseyNumber: true,
      team: { select: { teamName: true } },
    },
    orderBy: [{ team: { teamName: "asc" } }, { fullName: "asc" }],
  });

  const rowsToCreate: Array<{
    ballotCycleId: string;
    organizationId: string;
    ageGroup: string;
    playerFullName: string;
    team: string;
    jerseyNumber: string;
    showcaseBibNumber: null;
  }> = [];
  let skipped = 0;
  for (const player of players) {
    const playerFullName = String(player.fullName || "").trim();
    const team = String(player.team.teamName || "").trim();
    const jerseyNumber = normalizeJerseyNumber(player.jerseyNumber);
    if (!playerFullName || !team) {
      skipped += 1;
      continue;
    }

    const key = [
      normalizeCandidateKey(playerFullName),
      normalizeCandidateKey(team),
      normalizeCandidateKey(jerseyNumber),
    ].join("::");
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    rowsToCreate.push({
      ballotCycleId: cycle.id,
      organizationId: cycle.organizationId,
      ageGroup: cycle.ageGroup,
      playerFullName,
      team,
      jerseyNumber,
      showcaseBibNumber: null,
    });
    existingKeys.add(key);
  }

  const created = rowsToCreate.length;
  if (created > 0) {
    await tx.allStarCandidate.createMany({
      data: rowsToCreate,
    });
    await resequenceCandidateBibNumbers(tx, cycle.id);
  }

  return { created, skipped, processed: players.length };
}
