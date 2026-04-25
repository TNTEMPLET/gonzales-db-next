import type { NextRequest } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import prisma from "@/lib/prisma";

/**
 * Resolve the RegisteredUser.id for the authenticated request.
 * When targetOrg is "master" there are no master-scoped RegisteredUser rows,
 * so we look up the admin by email across any org.
 */
export async function resolveAuthorId(
  request: NextRequest,
  targetOrg: string,
): Promise<string | null> {
  const coachUser = await getCoachUserFromRequest(request);
  if (coachUser?.id) return coachUser.id;

  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return null;

  const where =
    targetOrg === "master"
      ? { email: adminUser.email }
      : { organizationId: targetOrg, email: adminUser.email };

  const reg = await prisma.registeredUser.findFirst({
    where,
    select: { id: true },
  });
  return reg?.id ?? null;
}

export async function isCoach(request: NextRequest): Promise<boolean> {
  const coachUser = await getCoachUserFromRequest(request);
  if (coachUser?.isCoach) return true;
  const adminUser = await getAdminUserFromRequest(request);
  return Boolean(adminUser);
}

export async function ensureCoach(request: NextRequest): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  if (!(await isCoach(request))) {
    return {
      ok: false,
      status: 401,
      message: "Coach access required",
    };
  }

  return { ok: true, status: 200 };
}
