import crypto from "node:crypto";

import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { getDugoutRegisteredUserOrgId } from "@/lib/siteConfig";

export const COACH_SESSION_COOKIE = "gdb_coach_session";
const SESSION_TTL_DAYS = 7;

export type CoachSessionUser = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  isCoach: boolean;
  isBlocked: boolean;
  avatarUrl: string | null;
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getExpiryDate() {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);
  return expires;
}

export async function createCoachSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = getExpiryDate();

  await prisma.coachSession.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  return {
    token,
    expiresAt,
  };
}

export async function getCoachUserFromCookieToken(token: string | undefined) {
  return getCoachUserByToken(token);
}

export async function getCoachUserByToken(token: string | undefined) {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.coachSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.coachSession
      .delete({ where: { tokenHash } })
      .catch(() => null);
    return null;
  }

  // Resolve effective per-org isCoach from the profile using the current deployment's org bucket.
  const orgForProfile = getDugoutRegisteredUserOrgId();
  const profile = await (prisma as any).registeredUserOrgProfile.findUnique({
    where: {
      registeredUserId_organizationId: {
        registeredUserId: session.user.id,
        organizationId: orgForProfile,
      },
    },
    select: { isCoach: true },
  });

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    isCoach: profile?.isCoach ?? false,
    isBlocked: session.user.isBlocked,
    avatarUrl: session.user.avatarUrl ?? null,
  } satisfies CoachSessionUser;
}

export async function getCoachUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(COACH_SESSION_COOKIE)?.value;
  return getCoachUserByToken(token);
}

export async function clearCoachSessionByToken(token: string | undefined) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await prisma.coachSession.deleteMany({ where: { tokenHash } });
}
