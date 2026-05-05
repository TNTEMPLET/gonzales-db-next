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

    const users = await prisma.registeredUser.findMany({
      where: { organizationId: targetOrg },
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [{ email: "asc" }],
    });

    return NextResponse.json({ data: users });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load user options: ${message}` },
      { status: 500 },
    );
  }
}
