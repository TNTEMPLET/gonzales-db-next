import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export async function GET(request: NextRequest) {
  try {
    const auth = await ensureAllStarVaultAdmin(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.message || "Unauthorized" },
        { status: auth.status },
      );
    }

    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));

    // Global identity: RegisteredUser has no organizationId. Find users who have a profile in this org.
    const profiles = await (prisma as any).registeredUserOrgProfile.findMany({
      where: { organizationId: targetOrg },
      include: {
        registeredUser: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    // Dedup by user id (in case of multiple profiles historically) and return global user shape.
    const seen = new Set<string>();
    const users = [];
    for (const p of profiles) {
      const u = p.registeredUser;
      if (!u || seen.has(u.id)) continue;
      seen.add(u.id);
      users.push(u);
    }
    // Sort by email for stable UI
    users.sort((a: any, b: any) => (a.email || "").localeCompare(b.email || ""));

    return NextResponse.json({ data: users });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load user options: ${message}` },
      { status: 500 },
    );
  }
}
