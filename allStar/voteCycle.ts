import prisma from "@/lib/prisma";

/** Query-string variants to try for `ballotLinkToken` lookup (typed lowercase, etc.). */
function ballotLinkTokenLookupVariants(raw: string | null | undefined): string[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  // Typable short codes: allow case-insensitive match. Skip for long base64url-style tokens.
  if (trimmed.length <= 12 && !/[-_]/.test(trimmed)) {
    const up = trimmed.toUpperCase();
    if (up !== trimmed) variants.add(up);
  }
  return [...variants];
}

/**
 * Resolves the ballot cycle id from `cycleId` / `c` and optional shared-link `token` / `t`.
 * When only a shared `ballotLinkToken` is present, looks up the cycle by that token (globally unique).
 */
export async function resolveCycleIdForVoteRequest(
  cycleId: string | null | undefined,
  token: string | null | undefined,
): Promise<string | null> {
  const direct = cycleId?.trim();
  if (direct) return direct;
  const variants = ballotLinkTokenLookupVariants(token);
  if (variants.length === 0) return null;
  const cycle = await prisma.allStarBallotCycle.findFirst({
    where: { ballotLinkToken: { in: variants } },
    select: { id: true },
  });
  return cycle?.id ?? null;
}
