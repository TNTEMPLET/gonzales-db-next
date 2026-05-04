import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { refreshDuplicateReviewPendingFlag } from "@/lib/registeredUserDuplicates";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

/** List name-based duplicate candidates for admin review (merge/dismiss). */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const statusParam = request.nextUrl.searchParams.get("status");
    const status: "PENDING" | "DISMISSED" | "MERGED" =
      statusParam === "DISMISSED" || statusParam === "MERGED" || statusParam === "PENDING"
        ? statusParam
        : "PENDING";

    const rows = await prisma.registeredUserDuplicateCandidate.findMany({
      where: {
        organizationId: targetOrg,
        status,
      },
      orderBy: { createdAt: "desc" },
      include: {
        newerUser: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
            createdAt: true,
            duplicateReviewPending: true,
          },
        },
        candidateUser: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      targetOrg,
      candidates: rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load duplicate candidates: ${message}` },
      { status: 500 },
    );
  }
}

/** Dismiss a candidate pair (not a duplicate). */
export async function PATCH(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const body = (await request.json()) as { candidateId?: string };
    const candidateId = body.candidateId?.trim();
    if (!candidateId) {
      return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
    }

    const row = await prisma.registeredUserDuplicateCandidate.findUnique({
      where: { id: candidateId },
    });
    if (!row) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    if (row.organizationId !== targetOrg) {
      return NextResponse.json({ error: "Wrong organization" }, { status: 403 });
    }

    await prisma.registeredUserDuplicateCandidate.update({
      where: { id: candidateId },
      data: {
        status: "DISMISSED",
        resolvedAt: new Date(),
      },
    });

    await refreshDuplicateReviewPendingFlag(prisma, row.newerUserId);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to dismiss: ${message}` },
      { status: 500 },
    );
  }
}
