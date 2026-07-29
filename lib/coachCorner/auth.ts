import type { NextRequest } from "next/server";

import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
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
    // Global identity: presence in the org is represented by a profile row.
    const profile = await (prisma as any).registeredUserOrgProfile.findUnique({
      where: {
        registeredUserId_organizationId: { registeredUserId: coach.id, organizationId: targetOrg },
      },
      select: { registeredUserId: true },
    });
    if (profile) {
      // Also confirm not blocked (global flag lives on the user).
      const u = await prisma.registeredUser.findUnique({
        where: { id: coach.id },
        select: { isBlocked: true },
      });
      if (u && !u.isBlocked) {
        return { targetOrg, registeredUserId: coach.id, isAdmin: false };
      }
    }
  }

  const admin = await getAdminUserFromRequest(request);
  if (!admin) return null;

  if (!admin.isMaster) {
    const eff = await getEffectiveAdminRoleForOrg(admin.id, admin.isMaster, targetOrg);
    if (!eff || !hasAdminRoleAtLeast(eff, "PARK_DIRECTOR")) {
      return null;
    }
  }
  // Masters pass the gate; email match below decides the linked RegisteredUser.

  const existing = await prisma.registeredUser.findFirst({
    where: {
      email: { equals: admin.email, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, isBlocked: true },
  });
  if (existing && !existing.isBlocked) {
    // Ensure a profile row exists for this org (global user).
    await (prisma as any).registeredUserOrgProfile.upsert({
      where: {
        registeredUserId_organizationId: { registeredUserId: existing.id, organizationId: targetOrg },
      },
      create: {
        registeredUserId: existing.id,
        organizationId: targetOrg,
        isCoach: true,
        ageGroup: null,
        assignedTeam: null,
      },
      update: { isCoach: true },
    });
    return { targetOrg, registeredUserId: existing.id, isAdmin: true };
  }

  const created = await prisma.registeredUser.create({
    data: {
      email: admin.email.toLowerCase(),
      firstName: admin.firstName?.trim() || null,
      lastName: admin.lastName?.trim() || null,
      name:
        [admin.firstName, admin.lastName].filter(Boolean).join(" ").trim() ||
        admin.name ||
        null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
    },
  });

  await (prisma as any).registeredUserOrgProfile.create({
    data: {
      registeredUserId: created.id,
      organizationId: targetOrg,
      isCoach: true,
      ageGroup: null,
      assignedTeam: null,
    },
  });

  await recordDuplicateCandidatesForNewUser(prisma, created);

  return { targetOrg, registeredUserId: created.id, isAdmin: true };
}
