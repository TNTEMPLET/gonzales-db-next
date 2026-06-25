import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { CONTENT_ORGS, resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";

type ScrollerPatchPayload = {
  showInFooterScroller?: boolean;
  sortOrder?: number;
  orgTargets?: string[];
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "SPONSORS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const { id } = await params;
  try {
    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const body = (await request.json()) as ScrollerPatchPayload;
    const showInFooterScroller =
      typeof body.showInFooterScroller === "boolean"
        ? body.showInFooterScroller
        : undefined;
    const sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? Math.floor(body.sortOrder)
        : undefined;

    const existing = await prisma.sponsor.findFirst({
      where: {
        id,
        placements: {
          some: {
            organizationId: targetOrg,
          },
        },
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
    }

    const orgTargets = Array.isArray(body.orgTargets)
      ? body.orgTargets.filter(
          (entry): entry is ContentOrgId =>
            CONTENT_ORGS.includes(entry as ContentOrgId),
        )
      : [targetOrg];
    const uniqueTargets = Array.from(new Set(orgTargets));

    await prisma.sponsorPlacement.updateMany({
      where: {
        sponsorId: id,
        organizationId: { in: uniqueTargets },
      },
      data: {
        showInFooterScroller,
        sortOrder,
      },
    });

    const placements = await prisma.sponsorPlacement.findMany({
      where: { sponsorId: id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ data: placements });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update scroller settings: ${message}` },
      { status: 500 },
    );
  }
}
