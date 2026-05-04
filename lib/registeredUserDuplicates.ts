import type { PrismaClient } from "@prisma/client";

/**
 * Normalized "first|last" key for duplicate detection (same org, same key → possible duplicate).
 * Uses first+last when both present; otherwise derives from full `name` (first token | rest).
 */
export function nameMatchKeyFromParts(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fullName: string | null | undefined,
): string | null {
  const f = firstName?.trim();
  const l = lastName?.trim();
  if (f && l) {
    return `${f.toLowerCase()}|${l.toLowerCase()}`;
  }
  const full = fullName?.trim();
  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0].toLowerCase()}|${parts.slice(1).join(" ").toLowerCase()}`;
    }
  }
  return null;
}

/**
 * After a brand-new `RegisteredUser` row is created, find same-org accounts with the same
 * normalized name key and record merge-review candidates. Never throws to callers.
 */
export async function recordDuplicateCandidatesForNewUser(
  prisma: PrismaClient,
  newUser: {
    id: string;
    organizationId: string;
    firstName: string | null;
    lastName: string | null;
    name: string | null;
  },
): Promise<void> {
  try {
    const key = nameMatchKeyFromParts(
      newUser.firstName,
      newUser.lastName,
      newUser.name,
    );
    if (!key) return;

    const peers = await prisma.registeredUser.findMany({
      where: {
        organizationId: newUser.organizationId,
        id: { not: newUser.id },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
      },
    });

    const matches = peers.filter((p) => {
      const pk = nameMatchKeyFromParts(p.firstName, p.lastName, p.name);
      return pk !== null && pk === key;
    });

    if (matches.length === 0) return;

    await prisma.registeredUserDuplicateCandidate.createMany({
      data: matches.map((m) => ({
        organizationId: newUser.organizationId,
        newerUserId: newUser.id,
        candidateUserId: m.id,
        matchReason: "NAME_NORMALIZED" as const,
        status: "PENDING" as const,
      })),
      skipDuplicates: true,
    });

    await prisma.registeredUser.update({
      where: { id: newUser.id },
      data: { duplicateReviewPending: true },
    });
  } catch (err) {
    console.error("[registeredUserDuplicates] recordDuplicateCandidatesForNewUser:", err);
  }
}

export async function refreshDuplicateReviewPendingFlag(
  prisma: PrismaClient,
  newerUserId: string,
): Promise<void> {
  const pending = await prisma.registeredUserDuplicateCandidate.count({
    where: { newerUserId, status: "PENDING" },
  });
  await prisma.registeredUser.update({
    where: { id: newerUserId },
    data: { duplicateReviewPending: pending > 0 },
  });
}
