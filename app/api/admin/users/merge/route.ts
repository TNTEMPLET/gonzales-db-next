import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { PROTECTED_MASTER_ADMIN_EMAIL } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { mergeRegisteredUsers } from "@/lib/registeredUserMerge";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

function getSourcePath(request: NextRequest) {
  const explicitPath = request.headers.get("x-source-path")?.trim();
  if (explicitPath) return explicitPath;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function getRequestIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  const realIp = request.headers.get("x-real-ip");
  return realIp?.trim() || null;
}

type MergeBody = {
  keepUserId?: string;
  mergeUserId?: string;
};

/**
 * Merge two registered-user rows in the same org: all activity moves to `keepUserId`,
 * then `mergeUserId` is deleted. Cannot delete the protected master account as merge target.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const body = (await request.json()) as MergeBody;
    const keepUserId = body.keepUserId?.trim();
    const mergeUserId = body.mergeUserId?.trim();
    if (!keepUserId || !mergeUserId) {
      return NextResponse.json(
        { error: "keepUserId and mergeUserId are required" },
        { status: 400 },
      );
    }

    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));

    const mergeUser = await prisma.registeredUser.findUnique({
      where: { id: mergeUserId },
    });
    if (!mergeUser) {
      return NextResponse.json({ error: "Merge user not found" }, { status: 404 });
    }
    // Under global identity, verify the user has (or will have) presence in the target org via profile.
    const mergeProfile = await (prisma as any).registeredUserOrgProfile.findUnique({
      where: { registeredUserId_organizationId: { registeredUserId: mergeUser.id, organizationId: targetOrg } },
    });
    if (!mergeProfile) {
      return NextResponse.json({ error: "Merge user not found for org" }, { status: 404 });
    }

    const keepUser = await prisma.registeredUser.findUnique({
      where: { id: keepUserId },
    });
    if (!keepUser) {
      return NextResponse.json({ error: "Keep user not found" }, { status: 404 });
    }
    const keepProfile = await (prisma as any).registeredUserOrgProfile.findUnique({
      where: { registeredUserId_organizationId: { registeredUserId: keepUser.id, organizationId: targetOrg } },
    });
    if (!keepProfile) {
      return NextResponse.json({ error: "Keep user not found for org" }, { status: 404 });
    }

    const currentAdmin = await getAdminUserFromRequest(request);
    const actorEmail = currentAdmin?.email?.trim().toLowerCase() || "";
    if (
      mergeUser.email.trim().toLowerCase() === PROTECTED_MASTER_ADMIN_EMAIL ||
      keepUser.email.trim().toLowerCase() === PROTECTED_MASTER_ADMIN_EMAIL
    ) {
      if (actorEmail !== PROTECTED_MASTER_ADMIN_EMAIL) {
        return NextResponse.json(
          { error: "Only the protected master account can merge accounts involving it." },
          { status: 403 },
        );
      }
    }

    const mergeEmailSnapshot = mergeUser.email;
    const mergeNameSnapshot = mergeUser.name;

    await mergeRegisteredUsers(prisma, {
      keepUserId,
      mergeUserId,
      organizationId: targetOrg,
    });

    // Cannot reference `mergeUserId` here — that row was deleted. Snapshot email/name only.
    await prisma.adminAuditLog.create({
      data: {
        action: "MERGE_USERS",
        actorAdminId: currentAdmin?.id ?? null,
        actorEmail: currentAdmin?.email || "unknown",
        targetRegisteredUserId: null,
        targetEmail: mergeEmailSnapshot,
        targetName: mergeNameSnapshot,
        sourcePath: getSourcePath(request),
        requestIp: getRequestIp(request),
      },
    });

    return NextResponse.json({
      success: true,
      keptUserId: keepUserId,
      mergedUserId: mergeUserId,
    });
  } catch (err: unknown) {
    let message = "Merge failed";
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      message = err.message;
    } else if (err instanceof Error && err.message.trim()) {
      message = err.message;
    } else if (typeof err === "string" && err.trim()) {
      message = err;
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
