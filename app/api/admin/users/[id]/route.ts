import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const targetOrg = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );
  const body = (await request.json()) as {
    isCoach?: boolean;
    isBlocked?: boolean;
    firstName?: string;
    lastName?: string;
  };

  const hasCoachUpdate = typeof body.isCoach === "boolean";
  const hasBlockedUpdate = typeof body.isBlocked === "boolean";
  const hasFirstNameUpdate = typeof body.firstName === "string";
  const hasLastNameUpdate = typeof body.lastName === "string";

  if (
    !hasCoachUpdate &&
    !hasBlockedUpdate &&
    !hasFirstNameUpdate &&
    !hasLastNameUpdate
  ) {
    return NextResponse.json(
      {
        error:
          "At least one updatable field is required: isCoach, isBlocked, firstName, or lastName",
      },
      { status: 400 },
    );
  }

  const user = await prisma.registeredUser.findUnique({ where: { id } });
  if (!user || user.organizationId !== targetOrg) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updateData: {
    isCoach?: boolean;
    isBlocked?: boolean;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
  } = {};

  if (hasCoachUpdate) {
    updateData.isCoach = body.isCoach;
  }
  if (hasBlockedUpdate) {
    updateData.isBlocked = body.isBlocked;
  }

  if (hasFirstNameUpdate || hasLastNameUpdate) {
    const nextFirstName = hasFirstNameUpdate
      ? body.firstName?.trim() || null
      : user.firstName;
    const nextLastName = hasLastNameUpdate
      ? body.lastName?.trim() || null
      : user.lastName;
    const composedName = [nextFirstName, nextLastName]
      .filter(Boolean)
      .join(" ");

    updateData.firstName = nextFirstName;
    updateData.lastName = nextLastName;
    updateData.name = composedName || null;
  }

  const updated = await prisma.registeredUser.update({
    where: { id },
    data: updateData,
  });

  // Log block/unblock action to audit log
  if (hasBlockedUpdate) {
    const sourcePath = getSourcePath(request);
    const requestIp = getRequestIp(request);

    const action = body.isBlocked ? "BLOCK" : "UNBLOCK";
    await prisma.adminAuditLog.create({
      data: {
        action: action as "BLOCK" | "UNBLOCK",
        actorAdminId: admin.id,
        actorEmail: admin.email,
        targetRegisteredUserId: user.id,
        targetEmail: user.email,
        targetName: user.name,
        sourcePath,
        requestIp,
      },
    });
  }

  return NextResponse.json({ user: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const targetOrg = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );
  const user = await prisma.registeredUser.findUnique({ where: { id } });

  if (!user || user.organizationId !== targetOrg) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const sourcePath = getSourcePath(request);
  const requestIp = getRequestIp(request);

  // Log removal to audit log
  await prisma.adminAuditLog.create({
    data: {
      action: "REMOVE",
      actorAdminId: admin.id,
      actorEmail: admin.email,
      targetRegisteredUserId: user.id,
      targetEmail: user.email,
      targetName: user.name,
      sourcePath,
      requestIp,
    },
  });

  // Delete user sessions, posts, comments, and likes
  await Promise.all([
    prisma.coachSession.deleteMany({ where: { userId: id } }),
    prisma.dugoutNotificationRead.deleteMany({ where: { userId: id } }),
    prisma.dugoutNotificationCursor.deleteMany({ where: { userId: id } }),
    prisma.dugoutPostLike.deleteMany({ where: { userId: id } }),
    prisma.dugoutComment.deleteMany({ where: { authorId: id } }),
    prisma.dugoutPost.deleteMany({ where: { authorId: id } }),
  ]);

  // Delete the registered user
  const deleted = await prisma.registeredUser.delete({ where: { id } });

  return NextResponse.json({
    success: true,
    removed: {
      id: deleted.id,
      email: deleted.email,
      name: deleted.name,
    },
  });
}
