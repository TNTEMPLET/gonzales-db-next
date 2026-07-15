import type { NextRequest } from "next/server";

import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
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
    const user = await prisma.registeredUser.findFirst({
      where: {
        id: coach.id,
        organizationId: targetOrg,
        isBlocked: false,
      },
      select: { id: true },
    });
    if (user) {
      return {
        targetOrg,
        registeredUserId: user.id,
        isAdmin: false,
      };
    }
    // Cookie user may be on another org bucket — match by email on target org.
    const byEmail = await prisma.registeredUser.findFirst({
      where: {
        organizationId: targetOrg,
        email: { equals: coach.email, mode: "insensitive" },
        isBlocked: false,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (byEmail) {
      return {
        targetOrg,
        registeredUserId: byEmail.id,
        isAdmin: false,
      };
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
    return {
      targetOrg,
      registeredUserId: existing.id,
      isAdmin: true,
    };
  }

  return null;
}
