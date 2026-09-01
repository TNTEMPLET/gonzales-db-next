import { assignJerseyNumbersForTeam } from "@/lib/admin/jerseyNumbers";
import { syncDraftTeamRealization } from "@/lib/draft/syncDraftTeamRealization";
import { prisma } from "@/lib/prisma";

/**
 * Materializes a completed draft session into official Teams, TeamPlayer, and TeamCoachAssignment records.
 */
export async function materializeDraftSession(draftSessionId: string) {
  const session = await prisma.draftSession.findUnique({
    where: { id: draftSessionId },
    include: {
      teams: {
        include: {
          picks: true,
          headCoach: true,
          assistantCoach: true,
        },
      },
      playerPool: true,
    },
  });

  if (!session) {
    throw new Error(`DraftSession not found: ${draftSessionId}`);
  }

  return await prisma.$transaction(async (tx) => {
    const createdTeams = [];

    for (const draftTeam of session.teams) {
      // Find-or-create + rename + coach-assignment sync all live in one
      // place now (lib/draft/syncDraftTeamRealization.ts) -- the same
      // logic already ran when this draft team's board/coaches were set
      // up, so by materialization time this is normally a no-op confirm;
      // it stays here as the fallback for any draft team that somehow
      // never got synced during setup.
      const team = await syncDraftTeamRealization(tx, draftTeam.id);
      if (!team) continue;
      createdTeams.push(team);

      // Create TeamPlayer records for drafted players
      for (const pick of draftTeam.picks) {
        const poolPlayer = session.playerPool.find((p) => p.id === pick.playerPoolId);
        if (!poolPlayer) continue;

        // Matched by division (org+season+ageGroup), not the specific new
        // team: a player registered before the draft (e.g. sitting on the
        // "Unallocated" placeholder team from a plain SportsConnect import)
        // must be *relocated* onto their drafted team here, not duplicated
        // -- the exact same reasoning app/api/admin/teams/import/route.ts's
        // resolveTeamPlayerIdentityMatch already documents for its own
        // division-scoped lookup. Scoping this to `teamId: team.id` alone
        // (the previous behavior) always missed since the new team never
        // has any players yet, so every drafted player who'd already been
        // imported got a second, duplicate row instead of moved.
        const existingPlayer = await tx.teamPlayer.findFirst({
          where: {
            fullName: { equals: poolPlayer.fullName, mode: "insensitive" },
            team: {
              organizationId: session.organizationId,
              seasonYear: session.seasonYear,
              ageGroup: session.ageGroup,
            },
          },
        });

        if (existingPlayer) {
          await tx.teamPlayer.update({
            where: { id: existingPlayer.id },
            data: {
              teamId: team.id,
              rosterStatus: "DRAFTED",
              // Only fill in what the existing (pre-draft registration) row
              // doesn't already have -- never overwrite real registration
              // data with the lighter-weight draft pool entry's copy of it.
              ...(existingPlayer.guardianEmail == null ? { guardianEmail: poolPlayer.guardianEmail } : {}),
              ...(existingPlayer.guardianPhone == null ? { guardianPhone: poolPlayer.guardianPhone } : {}),
              ...(existingPlayer.birthDate == null && poolPlayer.birthDate
                ? { birthDate: poolPlayer.birthDate.toISOString() }
                : {}),
            },
          });
        } else {
          await tx.teamPlayer.create({
            data: {
              teamId: team.id,
              firstName: poolPlayer.firstName,
              lastName: poolPlayer.lastName,
              fullName: poolPlayer.fullName,
              guardianEmail: poolPlayer.guardianEmail,
              guardianPhone: poolPlayer.guardianPhone,
              birthDate: poolPlayer.birthDate ? poolPlayer.birthDate.toISOString() : null,
              rosterStatus: "DRAFTED",
            },
          });
        }
      }

      // A finished draft is a finalized roster — number jerseys right away
      // instead of leaving it as a separate manual step per team. Jersey
      // size isn't captured in the draft pool today, so this falls back to
      // alphabetical-by-last-name until that's added; still gives every
      // drafted player a number.
      await assignJerseyNumbersForTeam(tx, team.id);
    }

    // 5. Update session status to MATERIALIZED
    const updatedSession = await tx.draftSession.update({
      where: { id: draftSessionId },
      data: { status: "MATERIALIZED" },
    });

    return {
      session: updatedSession,
      createdTeamsCount: createdTeams.length,
    };
  });
}
