import crypto from "node:crypto";

import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";

export const COACH_SESSION_COOKIE = "gdb_coach_session";
const SESSION_TTL_DAYS = 7;

export type CoachSessionUser = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  isCoach: boolean;
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

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    isCoach: session.user.isCoach,
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
