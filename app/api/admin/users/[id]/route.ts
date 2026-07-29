import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
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
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

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
    contactPhone?: string | null;
    ageGroup?: string | null;
    assignedTeam?: string | null;
  };

  const hasCoachUpdate = typeof body.isCoach === "boolean";
  const hasBlockedUpdate = typeof body.isBlocked === "boolean";
  const hasFirstNameUpdate = typeof body.firstName === "string";
  const hasLastNameUpdate = typeof body.lastName === "string";
  const hasContactPhoneUpdate = "contactPhone" in body;
  const hasAgeGroupUpdate = "ageGroup" in body;
  const hasAssignedTeamUpdate = "assignedTeam" in body;

  if (
    !hasCoachUpdate &&
    !hasBlockedUpdate &&
    !hasFirstNameUpdate &&
    !hasLastNameUpdate &&
    !hasContactPhoneUpdate &&
    !hasAgeGroupUpdate &&
    !hasAssignedTeamUpdate
  ) {
    return NextResponse.json(
      {
        error:
          "At least one updatable field is required: isCoach, isBlocked, firstName, lastName, contactPhone, ageGroup, or assignedTeam",
      },
      { status: 400 },
    );
  }

  const globalUser = await prisma.registeredUser.findUnique({ where: { id } });
  if (!globalUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Under global identity, existence of a profile row for this org means "this org knows the user".
  // Use any-cast because the Prisma client in some Vercel builds may not yet know the new model.
  const profile = await (prisma as any).registeredUserOrgProfile.findUnique({
    where: {
      registeredUserId_organizationId: {
        registeredUserId: globalUser.id,
        organizationId: targetOrg,
      },
    },
  });
  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updateData: {
    isBlocked?: boolean;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    contactPhone?: string | null;
  } = {};

  const profileUpdate: {
    isCoach?: boolean;
    ageGroup?: string | null;
    assignedTeam?: string | null;
  } = {};

  if (hasCoachUpdate) {
    profileUpdate.isCoach = body.isCoach;
  }
  if (hasBlockedUpdate) {
    updateData.isBlocked = body.isBlocked;
  }

  if (hasAgeGroupUpdate) {
    profileUpdate.ageGroup =
      typeof body.ageGroup === "string" ? body.ageGroup.trim() || null : null;
  }

  if (hasAssignedTeamUpdate) {
    profileUpdate.assignedTeam =
      typeof body.assignedTeam === "string"
        ? body.assignedTeam.trim() || null
        : null;
  }

  if (hasContactPhoneUpdate) {
    updateData.contactPhone =
      typeof body.contactPhone === "string"
        ? body.contactPhone.trim() || null
        : null;
  }

  if (hasFirstNameUpdate || hasLastNameUpdate) {
    const nextFirstName = hasFirstNameUpdate
      ? body.firstName?.trim() || null
      : globalUser.firstName;
    const nextLastName = hasLastNameUpdate
      ? body.lastName?.trim() || null
      : globalUser.lastName;
    const composedName = [nextFirstName, nextLastName]
      .filter(Boolean)
      .join(" ");

    updateData.firstName = nextFirstName;
    updateData.lastName = nextLastName;
    updateData.name = composedName || null;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.registeredUser.update({
      where: { id },
      data: updateData,
    });
  }

  if (Object.keys(profileUpdate).length > 0) {
    await (prisma as any).registeredUserOrgProfile.update({
      where: { registeredUserId_organizationId: { registeredUserId: globalUser.id, organizationId: targetOrg } },
      data: profileUpdate,
    });
  }

  const updated = await prisma.registeredUser.findUnique({ where: { id } });

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
        targetRegisteredUserId: globalUser.id,
        targetEmail: globalUser.email,
        targetName: globalUser.name,
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
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const admin = await getAdminUserFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const targetOrg = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );
  const user = await prisma.registeredUser.findUnique({ where: { id } });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Global identity: require a profile for this org.
  const profile = await (prisma as any).registeredUserOrgProfile.findUnique({
    where: { registeredUserId_organizationId: { registeredUserId: user.id, organizationId: targetOrg } },
  });
  if (!profile) {
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
