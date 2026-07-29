import type { NextRequest } from "next/server";

import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";

export type VolunteerCardActor = {
  targetOrg: ContentOrgId;
  registeredUserId: string;
  isAdmin: boolean;
};

/**
 * Who may view a self-serve volunteer card:
 * - Any signed-in registered user for this org (coach session), including
 *   volunteers who are not flagged isCoach
 * - Park Director+ admin with matching registered user (or admin email match)
 */
export async function resolveVolunteerCardActor(
  request: NextRequest,
): Promise<VolunteerCardActor | null> {
  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));

  const coach = await getCoachUserFromRequest(request);
  if (coach && !coach.isBlocked) {
    // Global identity: check that a profile exists for this org.
    const profile = await (prisma as any).registeredUserOrgProfile.findUnique({
      where: {
        registeredUserId_organizationId: { registeredUserId: coach.id, organizationId: targetOrg },
      },
      select: { registeredUserId: true },
    });
    if (profile) {
      return {
        targetOrg,
        registeredUserId: coach.id,
        isAdmin: false,
      };
    }
    // Fallback: global user by email that has a profile in target org.
    const profileByEmail = await (prisma as any).registeredUserOrgProfile.findFirst({
      where: {
        organizationId: targetOrg,
        registeredUser: {
          email: { equals: coach.email, mode: "insensitive" },
          isBlocked: false,
        },
      },
      select: { registeredUserId: true },
    });
    if (profileByEmail) {
      return {
        targetOrg,
        registeredUserId: profileByEmail.registeredUserId,
        isAdmin: false,
      };
    }
  }

  const admin = await getAdminUserFromRequest(request);
  if (!admin) return null;

  if (admin.isMaster) {
    // Masters get through the admin gate; actual PD+ enforcement for volunteer cards can be further
    // refined at call sites if needed. Email match below still applies.
  } else {
    const eff = await getEffectiveAdminRoleForOrg(admin.id, admin.isMaster, targetOrg);
    if (!eff || !hasAdminRoleAtLeast(eff, "PARK_DIRECTOR")) {
      return null;
    }
  }

  const existing = await prisma.registeredUser.findFirst({
    where: {
      email: { equals: admin.email, mode: "insensitive" },
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, isBlocked: true },
  });
  if (existing && !existing.isBlocked) {
    // Ensure profile for target org.
    await (prisma as any).registeredUserOrgProfile.upsert({
      where: {
        registeredUserId_organizationId: { registeredUserId: existing.id, organizationId: targetOrg },
      },
      create: {
        registeredUserId: existing.id,
        organizationId: targetOrg,
        isCoach: false,
        ageGroup: null,
        assignedTeam: null,
      },
      update: {},
    });
    return {
      targetOrg,
      registeredUserId: existing.id,
      isAdmin: true,
    };
  }

  return null;
}
