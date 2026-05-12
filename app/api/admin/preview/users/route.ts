import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { canViewAllStarVault } from "@/lib/allStar/auth";
import {
  formatPreviewUserLabel,
  type PreviewUserMembershipSnapshot,
  type PreviewUserSnapshot,
} from "@/lib/admin/viewPreview";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { CONTENT_ORGS, type ContentOrgId } from "@/lib/siteConfig";

export async function GET(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser || !adminUser.isMaster) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedOrg = searchParams.get("org");
  const targetOrgs: ContentOrgId[] =
    requestedOrg === "gonzales" || requestedOrg === "ascension"
      ? [requestedOrg]
      : CONTENT_ORGS;

  const admins = await prisma.adminUser.findMany({
    where: {
      OR: [
        { isMaster: true },
        { orgMemberships: { some: { organizationId: { in: targetOrgs } } } },
      ],
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      name: true,
      isMaster: true,
    },
    orderBy: [{ email: "asc" }],
  });

  const users: PreviewUserSnapshot[] = [];

  for (const admin of admins) {
    const memberships: PreviewUserMembershipSnapshot[] = [];

    for (const org of targetOrgs) {
      const effectiveRole = await getEffectiveAdminRoleForOrg(
        admin.id,
        admin.isMaster,
        org,
      );
      if (!effectiveRole) continue;

      const linkedUsers = await prisma.registeredUser.findMany({
        where: {
          email: { equals: admin.email, mode: "insensitive" },
          organizationId: org,
        },
        select: { id: true },
      });

      let allStarVaultView = false;
      for (const linked of linkedUsers) {
        if (await canViewAllStarVault(linked.id, org)) {
          allStarVaultView = true;
          break;
        }
      }

      memberships.push({
        organizationId: org,
        effectiveRole,
        allStarVaultView,
      });
    }

    if (memberships.length === 0) continue;

    users.push({
      id: admin.id,
      label: formatPreviewUserLabel(admin),
      memberships,
    });
  }

  users.sort((left, right) => left.label.localeCompare(right.label));

  return NextResponse.json({ users });
}
