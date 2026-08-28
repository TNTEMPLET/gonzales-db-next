import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

import { toAdminRole, type AdminRole } from "@/lib/auth/adminRoles";
import prisma from "@/lib/prisma";
import { withTransientDbRetry } from "@/lib/prismaRetry";

export const ADMIN_SESSION_COOKIE = "gdb_admin_session";
const SESSION_TTL_DAYS = 7;

export type AdminSessionUser = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: AdminRole;
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
  const bootstrapMasterEmail = (
    process.env.INITIAL_MASTER_ADMIN_EMAIL || "trent@apbaseball.com"
  )
    .trim()
    .toLowerCase();
  const bootstrapMasterPassword = process.env.INITIAL_MASTER_ADMIN_PASSWORD || "";

  const user = await withTransientDbRetry(() =>
    prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    }),
  );
  if (!user) return null;
  if (!user.passwordHash) {
    if (
      user.isMaster &&
      normalizedEmail === bootstrapMasterEmail &&
      bootstrapMasterPassword &&
      password === bootstrapMasterPassword
    ) {
      const newHash = await bcrypt.hash(password, 12);
      await prisma.adminUser.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: toAdminRole(user.role, user.isMaster),
        isMaster: user.isMaster,
      };
    }
    return null;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    role: toAdminRole(user.role, user.isMaster),
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

/**
 * Resolves a raw session token to the admin it belongs to. Never throws —
 * a missing/expired session, an orphaned session row (session.user null),
 * or a transient DB error all resolve to `null`, so callers (ensureAdminModule,
 * /api/admin/me, ...) can treat "not authenticated" and "auth check failed"
 * the same way: a clean 401 instead of an uncaught 500.
 */
export async function getAdminUserByToken(token: string | undefined) {
  if (!token) return null;

  const tokenHash = hashToken(token);

  try {
    const session = await withTransientDbRetry(() =>
      prisma.adminSession.findUnique({
        where: { tokenHash },
        include: { user: true },
      }),
    );

    if (!session) return null;

    // Defensive: the FK is onDelete: Cascade so this shouldn't happen in
    // practice, but an orphaned/partially-migrated row must not crash auth.
    if (!session.user) return null;

    if (session.expiresAt <= new Date()) {
      await withTransientDbRetry(() =>
        prisma.adminSession.delete({ where: { tokenHash } }),
      ).catch(() => null);
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      avatarUrl: session.user.avatarUrl ?? null,
      role: toAdminRole(session.user.role, session.user.isMaster),
      isMaster: session.user.isMaster,
    } satisfies AdminSessionUser;
  } catch (err) {
    console.error("[adminSession] getAdminUserByToken failed:", err);
    return null;
  }
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
