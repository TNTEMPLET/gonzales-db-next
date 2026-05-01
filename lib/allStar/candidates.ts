import type { Prisma } from "@prisma/client";

function formatBibNumber(position: number) {
  return String(position).padStart(3, "0");
}

export async function resequenceCandidateBibNumbers(
  tx: Prisma.TransactionClient,
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
