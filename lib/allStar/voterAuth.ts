import type { NextRequest } from "next/server";

import { hashToken } from "@/lib/allStar/server";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import prisma from "@/lib/prisma";

type RegisteredVoter = {
  id: string;
  email: string;
  organizationId: string;
  ageGroup: string | null;
  isCoach: boolean;
  isBlocked: boolean;
  isAdmin: boolean;
};

type ResolveAllStarVoterOptions = {
  cycleId?: string | null;
  token?: string | null;
};

/**
 * Resolve effective org/coach/age for a global user for a given cycle's org.
 * Uses RegisteredUserOrgProfile (global identity model).
 */
async function resolveVoterProfileForOrg(
  userId: string,
  email: string,
  targetOrg: string,
): Promise<{ organizationId: string; ageGroup: string | null; isCoach: boolean }> {
  const prof = await (prisma as any).registeredUserOrgProfile.findUnique({
    where: {
      registeredUserId_organizationId: { registeredUserId: userId, organizationId: targetOrg },
    },
    select: { organizationId: true, ageGroup: true, isCoach: true },
  });
  if (prof) {
    return { organizationId: prof.organizationId, ageGroup: prof.ageGroup ?? null, isCoach: !!prof.isCoach };
  }
  // Fallback: find any profile for this email's global user in that org by email match on profile join
  const byEmailProf = await (prisma as any).registeredUserOrgProfile.findFirst({
    where: {
      organizationId: targetOrg,
      registeredUser: { email: { equals: email, mode: "insensitive" } },
    },
    select: { organizationId: true, ageGroup: true, isCoach: true },
  });
  if (byEmailProf) {
    return { organizationId: byEmailProf.organizationId, ageGroup: byEmailProf.ageGroup ?? null, isCoach: !!byEmailProf.isCoach };
  }
  // Last resort: return the target org with defaults (caller will enforce isCoach etc.)
  return { organizationId: targetOrg, ageGroup: null, isCoach: false };
}

async function coachRegisteredUserForBallotCycle(
  sessionRow: {
    id: string;
    email: string;
    organizationId: string;
    ageGroup: string | null;
    isCoach: boolean;
    isBlocked: boolean;
  },
  cycleId: string | null | undefined,
) {
  if (!cycleId) return sessionRow;

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: { organizationId: true },
  });
  if (!cycle || sessionRow.organizationId === cycle.organizationId) {
    return sessionRow;
  }

  // Global by email, then profile for the cycle org
  const alt = await prisma.registeredUser.findFirst({
    where: { email: { equals: sessionRow.email, mode: "insensitive" }, isBlocked: false },
    select: { id: true, email: true, isBlocked: true },
  });
  if (!alt) return sessionRow;

  const prof = await resolveVoterProfileForOrg(alt.id, alt.email, cycle.organizationId);
  return {
    id: alt.id,
    email: alt.email,
    organizationId: prof.organizationId,
    ageGroup: prof.ageGroup,
    isCoach: prof.isCoach,
    isBlocked: alt.isBlocked,
  };
}

export async function resolveAllStarVoterFromRequest(
  request: NextRequest,
  options: ResolveAllStarVoterOptions = {},
) {
  const admin = await getAdminUserFromRequest(request);
  if (admin) {
    const g = await prisma.registeredUser.findFirst({
      where: { email: { equals: admin.email, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, email: true, isBlocked: true },
    });
    if (g && !g.isBlocked) {
      // We don't know a specific cycle org here; pick a representative org from any profile or default later in ensure.
      // For admin voters we keep a synthetic org until cycle context; use a safe placeholder that ensureVoterCanAccessCycle will override via cycle.
      // To keep shape stable, resolve using cycle if provided else first profile org.
      let org = "gonzales";
      let age: string | null = null;
      let coach = false;
      if (options.cycleId) {
        const c = await prisma.allStarBallotCycle.findUnique({ where: { id: options.cycleId }, select: { organizationId: true } });
        if (c) {
          const p = await resolveVoterProfileForOrg(g.id, g.email, c.organizationId);
          org = p.organizationId; age = p.ageGroup; coach = p.isCoach;
        }
      } else {
        const prof = await (prisma as any).registeredUserOrgProfile.findFirst({
          where: { registeredUserId: g.id },
          select: { organizationId: true, ageGroup: true, isCoach: true },
        });
        if (prof) { org = prof.organizationId; age = prof.ageGroup ?? null; coach = !!prof.isCoach; }
      }
      return { id: g.id, email: g.email, organizationId: org, ageGroup: age, isCoach: coach, isBlocked: false, isAdmin: true };
    }
  }

  const coach = await getCoachUserFromRequest(request);
  if (coach && !coach.isBlocked) {
    const g = await prisma.registeredUser.findUnique({
      where: { id: coach.id },
      select: { id: true, email: true, isBlocked: true },
    });
    if (g && !g.isBlocked) {
      let org = "gonzales";
      let age: string | null = null;
      let isC = false;
      if (options.cycleId) {
        const c = await prisma.allStarBallotCycle.findUnique({ where: { id: options.cycleId }, select: { organizationId: true } });
        if (c) {
          const p = await resolveVoterProfileForOrg(g.id, g.email, c.organizationId);
          org = p.organizationId; age = p.ageGroup; isC = p.isCoach;
        }
      } else {
        const prof = await (prisma as any).registeredUserOrgProfile.findFirst({
          where: { registeredUserId: g.id },
          select: { organizationId: true, ageGroup: true, isCoach: true },
        });
        if (prof) { org = prof.organizationId; age = prof.ageGroup ?? null; isC = !!prof.isCoach; }
      }
      const base = { id: g.id, email: g.email, organizationId: org, ageGroup: age, isCoach: isC, isBlocked: false };
      const aligned = await coachRegisteredUserForBallotCycle(base as any, options.cycleId);
      return { ...aligned, isAdmin: false };
    }
  }

  if (!options.token) return null;

  const hashed = hashToken(options.token);
  const invite = await prisma.allStarInvite.findFirst({
    where: { tokenHash: hashed },
    include: {
      invitedUser: {
        select: { id: true, email: true, isBlocked: true },
      },
    },
  });
  if (
    !invite ||
    invite.revokedAt ||
    (invite.expiresAt && invite.expiresAt < new Date()) ||
    (options.cycleId && invite.ballotCycleId !== options.cycleId)
  ) {
    return null;
  }

  // invitedUser may be a global id now; resolve profile for invite's org
  if (invite.invitedUser && !invite.invitedUser.isBlocked) {
    const p = await resolveVoterProfileForOrg(invite.invitedUser.id, invite.invitedUser.email, invite.organizationId);
    return { id: invite.invitedUser.id, email: invite.invitedUser.email, organizationId: p.organizationId, ageGroup: p.ageGroup, isCoach: p.isCoach, isBlocked: false, isAdmin: false };
  }

  const inviteEmailUser = await prisma.registeredUser.findFirst({
    where: {
      email: { equals: invite.invitedEmail, mode: "insensitive" },
      isBlocked: false,
    },
    select: { id: true, email: true, isBlocked: true },
  });

  if (!inviteEmailUser) return null;
  const p2 = await resolveVoterProfileForOrg(inviteEmailUser.id, inviteEmailUser.email, invite.organizationId);
  return { id: inviteEmailUser.id, email: inviteEmailUser.email, organizationId: p2.organizationId, ageGroup: p2.ageGroup, isCoach: p2.isCoach, isBlocked: false, isAdmin: false };
}

export async function ensureVoterCanAccessCycle(
  voter: RegisteredVoter,
  cycleId: string,
  token: string | null,
) {
  const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return { error: "Ballot cycle not found", status: 404 as const };
  if (cycle.status !== "PUBLISHED") {
    return { error: "Ballot is not currently open", status: 403 as const };
  }

  const now = new Date();
  if (!cycle.publishedAt || !cycle.closedAt) {
    return { error: "Ballot voting is not open yet", status: 403 as const };
  }
  if (cycle.publishedAt > now) {
    return { error: "Ballot is not open yet", status: 403 as const };
  }
  if (cycle.closedAt <= now) {
    return { error: "Ballot window has closed", status: 403 as const };
  }

  if (voter.isAdmin) {
    return { cycle, invite: null };
  }

  const tokenHash = token ? hashToken(token) : null;
  const sharedBallotTokenOk =
    Boolean(cycle.ballotLinkTokenHash) &&
    Boolean(tokenHash) &&
    tokenHash === cycle.ballotLinkTokenHash;

  const legacyInviteForToken =
    tokenHash &&
    (await prisma.allStarInvite.findFirst({
      where: {
        tokenHash,
        ballotCycleId: cycle.id,
        revokedAt: null,
      },
    }));

  if (cycle.accessMode === "INVITE_LIST") {
    const rosterEntry = await prisma.allStarInvite.findFirst({
      where: {
        ballotCycleId: cycle.id,
        invitedEmail: { equals: voter.email, mode: "insensitive" },
        revokedAt: null,
      },
    });
    if (!rosterEntry) {
      return {
        error: "This email is not authorized for this ballot",
        status: 403 as const,
      };
    }

    if (sharedBallotTokenOk) {
      return { cycle, invite: rosterEntry };
    }
    if (legacyInviteForToken) {
      if (
        legacyInviteForToken.invitedEmail.toLowerCase() !== voter.email.toLowerCase()
      ) {
        return { error: "Invalid invite token", status: 403 as const };
      }
      return { cycle, invite: legacyInviteForToken };
    }
    if (cycle.ballotLinkTokenHash) {
      return {
        error:
          "Use the shared ballot link from your league, then sign in with your invited email.",
        status: 403 as const,
      };
    }
    if (!token) {
      return { error: "Invite token required", status: 403 as const };
    }
    return { error: "Invalid or expired invite link", status: 403 as const };
  }

  if (cycle.ballotLinkTokenHash && !sharedBallotTokenOk) {
    if (
      legacyInviteForToken &&
      legacyInviteForToken.invitedEmail.toLowerCase() === voter.email.toLowerCase()
    ) {
      return { cycle, invite: legacyInviteForToken };
    }
    return {
      error:
        "Use the shared ballot link from your league, then sign in as a coach for this age group.",
      status: 403 as const,
    };
  }

  if (voter.organizationId !== cycle.organizationId) {
    return { error: "Wrong organization", status: 403 as const };
  }
  if (!voter.isCoach) {
    return { error: "Only coaches can access age-group ballots", status: 403 as const };
  }

  const cycleAgeNorm = cycle.ageGroup.trim().toLowerCase();
  const voterAgeNorm = (voter.ageGroup || "").trim().toLowerCase();
  if (voterAgeNorm !== cycleAgeNorm) {
    const headOnThisCycle = await prisma.allStarHeadCoachAssignment.findFirst({
      where: {
        ballotCycleId: cycle.id,
        registeredUserId: voter.id,
      },
      select: { id: true },
    });
    if (!headOnThisCycle) {
      const leagueAssignments = await prisma.teamCoachAssignment.findMany({
        where: {
          registeredUserId: voter.id,
          team: {
            organizationId: cycle.organizationId,
            seasonYear: cycle.seasonYear,
          },
        },
        select: { team: { select: { ageGroup: true } } },
      });
      const hasTeamInBallotAgeGroup = leagueAssignments.some(
        (a) => a.team.ageGroup.trim().toLowerCase() === cycleAgeNorm,
      );
      if (!hasTeamInBallotAgeGroup) {
        return { error: "Coach not in ballot age group", status: 403 as const };
      }
    }
  }

  const revokedRosterEntry = await prisma.allStarInvite.findFirst({
    where: {
      ballotCycleId: cycle.id,
      invitedEmail: { equals: voter.email, mode: "insensitive" },
      revokedAt: { not: null },
    },
    select: { id: true },
  });
  if (revokedRosterEntry) {
    return {
      error: "This email is not authorized for this ballot",
      status: 403 as const,
    };
  }

  return { cycle, invite: null };
}
