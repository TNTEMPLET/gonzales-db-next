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
};

type ResolveAllStarVoterOptions = {
  cycleId?: string | null;
  token?: string | null;
};

export async function resolveAllStarVoterFromRequest(
  request: NextRequest,
  options: ResolveAllStarVoterOptions = {},
) {
  const coach = await getCoachUserFromRequest(request);
  if (coach && !coach.isBlocked) {
    const registeredUser = await prisma.registeredUser.findUnique({
      where: { id: coach.id },
      select: {
        id: true,
        email: true,
        organizationId: true,
        ageGroup: true,
        isCoach: true,
        isBlocked: true,
      },
    });
    if (registeredUser && !registeredUser.isBlocked) {
      return registeredUser;
    }
  }

  const admin = await getAdminUserFromRequest(request);
  if (admin) {
    const registeredUser = await prisma.registeredUser.findFirst({
      where: { email: { equals: admin.email, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        email: true,
        organizationId: true,
        ageGroup: true,
        isCoach: true,
        isBlocked: true,
      },
    });

    if (registeredUser && !registeredUser.isBlocked) {
      return registeredUser;
    }
  }

  if (!options.token) return null;

  const invite = await prisma.allStarInvite.findUnique({
    where: { tokenHash: hashToken(options.token) },
    include: {
      invitedUser: {
        select: {
          id: true,
          email: true,
          organizationId: true,
          ageGroup: true,
          isCoach: true,
          isBlocked: true,
        },
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

  if (invite.invitedUser && !invite.invitedUser.isBlocked) {
    return invite.invitedUser;
  }

  const inviteEmailUser = await prisma.registeredUser.findFirst({
    where: {
      organizationId: invite.organizationId,
      email: { equals: invite.invitedEmail, mode: "insensitive" },
      isBlocked: false,
    },
    select: {
      id: true,
      email: true,
      organizationId: true,
      ageGroup: true,
      isCoach: true,
      isBlocked: true,
    },
  });

  return inviteEmailUser;
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
  if (cycle.publishedAt && cycle.publishedAt > now) {
    return { error: "Ballot is not open yet", status: 403 as const };
  }
  if (cycle.closedAt && cycle.closedAt <= now) {
    return { error: "Ballot window has closed", status: 403 as const };
  }

  if (cycle.accessMode === "INVITE_LIST") {
    if (!token) return { error: "Invite token required", status: 403 as const };
    const invite = await prisma.allStarInvite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (
      !invite ||
      invite.ballotCycleId !== cycle.id ||
      invite.revokedAt ||
      (invite.expiresAt && invite.expiresAt < new Date()) ||
      invite.invitedEmail.toLowerCase() !== voter.email.toLowerCase()
    ) {
      return { error: "Invalid invite token", status: 403 as const };
    }
    return { cycle, invite };
  }

  if (voter.organizationId !== cycle.organizationId) {
    return { error: "Wrong organization", status: 403 as const };
  }
  if (!voter.isCoach) {
    return { error: "Only coaches can access age-group ballots", status: 403 as const };
  }
  if ((voter.ageGroup || "").trim().toLowerCase() !== cycle.ageGroup.trim().toLowerCase()) {
    return { error: "Coach not in ballot age group", status: 403 as const };
  }

  return { cycle, invite: null };
}
