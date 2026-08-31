import "server-only";

import prisma from "@/lib/prisma";

/**
 * Resolves which existing TeamPlayer (if any) a Player Registration row
 * refers to, for a division (org+season+ageGroup) scope. Prefers
 * SportsConnect's own per-registrant Player ID over name matching -- two
 * different real kids sharing a name in the same division must never
 * resolve to the same row, which fullName-only matching can't guarantee.
 *
 * Match order:
 *  1. Row has a Player ID and an existing row in this division carries the
 *     *same* Player ID -> that row (real identity match, regardless of any
 *     name change/spelling correction since).
 *  2. Row has a Player ID but no row shares it yet -> only match a
 *     same-named row that has *no* Player ID recorded (pre-Player-ID
 *     legacy data), so the ID gets backfilled onto it. A same-named row
 *     that already carries a *different* Player ID is never matched here
 *     -- that's the fix: two real kids with the same name must not
 *     collapse into one row just because the second one lacks its own
 *     recorded identity yet.
 *  3. Row has no Player ID (legacy export) -> unchanged historical
 *     behavior: name match within the division.
 */
export async function resolveTeamPlayerIdentityMatch(params: {
  fullName: string;
  sportsConnectPlayerId: string | null;
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
}) {
  const teamScope = {
    organizationId: params.organizationId,
    seasonYear: params.seasonYear,
    ageGroup: params.ageGroup,
  };

  if (params.sportsConnectPlayerId) {
    const byId = await prisma.teamPlayer.findFirst({
      where: { sportsConnectPlayerId: params.sportsConnectPlayerId, team: teamScope },
      include: { team: { select: { teamName: true } } },
    });
    if (byId) return byId;

    return prisma.teamPlayer.findFirst({
      where: {
        fullName: { equals: params.fullName, mode: "insensitive" },
        sportsConnectPlayerId: null,
        team: teamScope,
      },
      include: { team: { select: { teamName: true } } },
    });
  }

  return prisma.teamPlayer.findFirst({
    where: { fullName: { equals: params.fullName, mode: "insensitive" }, team: teamScope },
    include: { team: { select: { teamName: true } } },
  });
}
