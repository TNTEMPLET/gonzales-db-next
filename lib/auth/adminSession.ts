import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

import prisma from "@/lib/prisma";
import { isMasterDeployment } from "@/lib/siteConfig";

export const ADMIN_SESSION_COOKIE = "gdb_admin_session";
const SESSION_TTL_DAYS = 7;

export type AdminSessionUser = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  isMaster: boolean;
};

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getExpiryDate() {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);
  return expires;
}

export async function verifyAdminCredentials(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.adminUser.findUnique({
    where: { email: normalizedEmail },
  });
  if (!user) return null;
  if (isMasterDeployment() && !user.isMaster) return null;
  if (!user.passwordHash) return null;

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    isMaster: user.isMaster,
  };
}

export async function createAdminSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = getExpiryDate();

  await prisma.adminSession.create({
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

export async function getAdminUserFromCookieToken(token: string | undefined) {
  return getAdminUserByToken(token);
}

export async function getAdminUserByToken(token: string | undefined) {
  if (!token) return null;

  const tokenHash = hashToken(token);

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.adminSession
      .delete({ where: { tokenHash } })
      .catch(() => null);
    return null;
  }

  if (isMasterDeployment() && !session.user.isMaster) {
    await prisma.adminSession
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
    avatarUrl: session.user.avatarUrl ?? null,
    isMaster: session.user.isMaster,
  } satisfies AdminSessionUser;
}

export async function getAdminUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  return getAdminUserByToken(token);
}

export async function deleteAdminSession(token: string | undefined) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await prisma.adminSession.deleteMany({ where: { tokenHash } });
}
