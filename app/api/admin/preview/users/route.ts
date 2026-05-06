import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { canViewAllStarVault } from "@/lib/allStar/auth";
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

  const users: Array<{
    id: string;
    label: string;
    effectiveRole: "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR";
    allStarVaultView: boolean;
  }> = [];

  for (const org of targetOrgs) {
    const memberships = await prisma.adminOrgMembership.findMany({
      where: { organizationId: org },
      include: {
        adminUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            name: true,
            isMaster: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { adminUser: { email: "asc" } }],
    });

    const orgUsers = await Promise.all(
      memberships.map(async (membership) => {
        const user = membership.adminUser;
        const effectiveRole = await getEffectiveAdminRoleForOrg(
          user.id,
          user.isMaster,
          org,
        );
        if (!effectiveRole) return null;

        const linkedUsers = await prisma.registeredUser.findMany({
          where: {
            email: { equals: user.email, mode: "insensitive" },
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

        const labelName =
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
          user.name ||
          user.email;
        const orgLabel = org === "ascension" ? "Ascension LL" : "Gonzales DYB";
        return {
          id: `${user.id}::${org}`,
          label: `${labelName} (${user.email}) · ${orgLabel}`,
          effectiveRole,
          allStarVaultView,
        };
      }),
    );
    users.push(
      ...orgUsers.filter(
        (
          value,
        ): value is {
          id: string;
          label: string;
          effectiveRole: "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR";
          allStarVaultView: boolean;
        } => Boolean(value),
      ),
    );
  }

  return NextResponse.json({
    users,
  });
}
