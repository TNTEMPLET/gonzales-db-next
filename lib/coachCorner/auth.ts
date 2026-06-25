import type { NextRequest } from "next/server";

import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import prisma from "@/lib/prisma";
import { recordDuplicateCandidatesForNewUser } from "@/lib/registeredUserDuplicates";
import { resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";

export type CoachCornerActor = {
  targetOrg: ContentOrgId;
  registeredUserId: string;
  isAdmin: boolean;
};

export async function resolveCoachCornerActor(
  request: NextRequest,
): Promise<CoachCornerActor | null> {
  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));

  const coach = await getCoachUserFromRequest(request);
  if (coach && coach.isCoach && !coach.isBlocked) {
    const user = await prisma.registeredUser.findUnique({
      where: { id: coach.id },
      select: { id: true, organizationId: true, isBlocked: true },
    });
    if (user && user.organizationId === targetOrg && !user.isBlocked) {
      return { targetOrg, registeredUserId: user.id, isAdmin: false };
    }
  }

  const admin = await getAdminUserFromRequest(request);
  if (!admin) return null;

  const adminRole = toAdminRole(admin.role, admin.isMaster);
  if (!hasAdminRoleAtLeast(adminRole, "PARK_DIRECTOR")) {
    return null;
  }

  const existing = await prisma.registeredUser.findFirst({
    where: {
      organizationId: targetOrg,
      email: { equals: admin.email, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, isBlocked: true },
  });
  if (existing && !existing.isBlocked) {
    return { targetOrg, registeredUserId: existing.id, isAdmin: true };
  }

  const created = await prisma.registeredUser.create({
    data: {
      organizationId: targetOrg,
      email: admin.email.toLowerCase(),
      firstName: admin.firstName?.trim() || null,
      lastName: admin.lastName?.trim() || null,
      name:
        [admin.firstName, admin.lastName].filter(Boolean).join(" ").trim() ||
        admin.name ||
        null,
      isCoach: true,
    },
    select: {
      id: true,
      organizationId: true,
      firstName: true,
      lastName: true,
      name: true,
    },
  });

  await recordDuplicateCandidatesForNewUser(prisma, created);

  return { targetOrg, registeredUserId: created.id, isAdmin: true };
}
