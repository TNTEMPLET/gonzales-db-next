import type { Prisma, PrismaClient } from "@prisma/client";

import { buildTeamNameFromSponsor } from "@/lib/admin/teamsImportHelpers";
import { syncCoachTeamAssignment } from "@/lib/coachCorner/syncCoachAssignment";

type DbClient = PrismaClient | Prisma.TransactionClient;

function lastNameOf(user: { lastName: string | null; name: string | null } | null | undefined): string {
  if (!user) return "";
  if (user.lastName?.trim()) return user.lastName.trim();
  const parts = user.name?.trim().split(/\s+/) ?? [];
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

/**
 * Computes the real team name for a draft team: bare name until a head
 * coach is assigned, then "{Draft Team Name} - {Head Coach Last Name}"
 * (same "{X} - {LastName}" convention as buildTeamNameFromSponsor(), reused
 * verbatim rather than re-implemented).
 */
export function computeDraftRealTeamName(
  draftTeamName: string,
  headCoach: { lastName: string | null; name: string | null } | null | undefined,
): string {
  const lastName = lastNameOf(headCoach);
  return buildTeamNameFromSponsor(draftTeamName, lastName) || draftTeamName;
}

/**
 * Makes a DraftTeam's linked real Team (DraftTeam.targetTeamId -- present in
 * the schema since the draft models were added, but never wired up until
 * now) match its current teamName/headCoach/assistantCoach: creates the
 * Team on first assignment (or renames it on subsequent changes), and
 * keeps its TeamCoachAssignment rows in sync (including removing a stale
 * assignment when a coach is reassigned or unassigned -- upsert alone
 * would leave the old coach's row behind since the unique key is
 * (teamId, registeredUserId), not (teamId, role)).
 *
 * The real Team becomes the source of truth for a draft-built division the
 * moment its draft board is set up -- not just after "Materialize" -- so
 * Equipment Checkout, Jersey Report, and Practice Scheduling can all
 * reference it while the draft is still in progress. A division whose
 * teams come from a direct SportsConnect team-list import never goes
 * through this path at all, so it's unaffected.
 */
export async function syncDraftTeamRealization(db: DbClient, draftTeamId: string): Promise<{ id: string; teamName: string } | null> {
  const draftTeam = await db.draftTeam.findUnique({
    where: { id: draftTeamId },
    include: {
      draftSession: { select: { organizationId: true, seasonYear: true, ageGroup: true } },
      headCoach: { select: { id: true, lastName: true, name: true } },
      assistantCoach: { select: { id: true, lastName: true, name: true } },
    },
  });
  if (!draftTeam) return null;

  const { organizationId, seasonYear, ageGroup } = draftTeam.draftSession;
  const finalTeamName = computeDraftRealTeamName(draftTeam.teamName, draftTeam.headCoach);

  let team: { id: string; teamName: string };
  if (draftTeam.targetTeamId) {
    team = await db.team.update({
      where: { id: draftTeam.targetTeamId },
      data: { teamName: finalTeamName },
      select: { id: true, teamName: true },
    });
  } else {
    try {
      const created = await db.team.create({
        data: { organizationId, seasonYear, ageGroup, teamName: finalTeamName },
        select: { id: true, teamName: true },
      });
      team = created;
    } catch {
      // Name collision (e.g. a team-list import already claimed this exact
      // name in this division) -- link to the existing row instead of
      // failing the whole draft-team save.
      const existing = await db.team.findUnique({
        where: { organizationId_seasonYear_ageGroup_teamName: { organizationId, seasonYear, ageGroup, teamName: finalTeamName } },
        select: { id: true, teamName: true },
      });
      if (!existing) throw new Error(`Failed to create or link real team for draft team ${draftTeamId}`);
      team = existing;
    }
    await db.draftTeam.update({ where: { id: draftTeam.id }, data: { targetTeamId: team.id } });
  }

  // Keep TeamCoachAssignment in lockstep: remove any assignment for this
  // role that no longer matches (reassigned or unassigned), then ensure the
  // current one exists.
  const roleTargets: Array<{ role: "HEAD_COACH" | "ASSISTANT_COACH"; userId: string | null }> = [
    { role: "HEAD_COACH", userId: draftTeam.headCoachUserId },
    { role: "ASSISTANT_COACH", userId: draftTeam.assistantUserId },
  ];
  for (const { role, userId } of roleTargets) {
    await db.teamCoachAssignment.deleteMany({
      where: { teamId: team.id, role, ...(userId ? { registeredUserId: { not: userId } } : {}) },
    });
    if (userId) {
      await db.teamCoachAssignment.upsert({
        where: { teamId_registeredUserId: { teamId: team.id, registeredUserId: userId } },
        create: { teamId: team.id, registeredUserId: userId, role },
        update: { role },
      });
      await syncCoachTeamAssignment(db, {
        registeredUserId: userId,
        organizationId,
        ageGroup,
        assignedTeam: team.teamName,
      });
    }
  }

  return team;
}
