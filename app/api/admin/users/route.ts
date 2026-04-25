import { NextRequest, NextResponse } from "next/server";

import {
  hasAdminRoleAtLeast,
  isAdminRole,
  PROTECTED_MASTER_ADMIN_EMAIL,
  toAdminRole,
} from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

type PromotePayload = {
  userId?: string;
  role?: string;
};

type DemotePayload = {
  adminId?: string;
  email?: string;
};

type RoleUpdatePayload = {
  adminId?: string;
  role?: string;
};

type AuditAction = "PROMOTE" | "DEMOTE";

function toPositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

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

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const query = request.nextUrl.searchParams;
    const targetOrg = resolveAdminTargetOrg(query.get("org"));
    const logPage = toPositiveInt(query.get("logPage"), 1);
    const logPageSize = Math.min(
      toPositiveInt(query.get("logPageSize"), 25),
      100,
    );
    const logQuery = query.get("logQuery")?.trim() || "";
    const logQueryUpper = logQuery.toUpperCase();
    const actionQuery: AuditAction | null =
      logQueryUpper === "PROMOTE"
        ? "PROMOTE"
        : logQueryUpper === "DEMOTE"
          ? "DEMOTE"
          : null;
    const logFrom = parseDate(query.get("logFrom"));
    const logTo = parseDate(query.get("logTo"));

    const auditWhere = {
      createdAt:
        logFrom || logTo
          ? {
              gte: logFrom || undefined,
              lte: logTo || undefined,
            }
          : undefined,
      OR: logQuery
        ? [
            { actorEmail: { contains: logQuery } },
            { targetEmail: { contains: logQuery } },
            { targetName: { contains: logQuery } },
            { sourcePath: { contains: logQuery } },
            { requestIp: { contains: logQuery } },
            ...(actionQuery ? [{ action: actionQuery }] : []),
          ]
        : undefined,
    };

    const [users, admins, currentAdmin, auditLogs, totalAuditLogs] =
      await Promise.all([
        prisma.registeredUser.findMany({
          where: { organizationId: targetOrg },
          orderBy: { createdAt: "desc" },
        }),
        prisma.adminUser.findMany({
          orderBy: { createdAt: "desc" },
        }),
        getAdminUserFromRequest(request),
        prisma.adminAuditLog.findMany({
          where: auditWhere,
          orderBy: { createdAt: "desc" },
          skip: (logPage - 1) * logPageSize,
          take: logPageSize,
        }),
        prisma.adminAuditLog.count({ where: auditWhere }),
      ]);

    const adminEmailSet = new Set(
      admins.map((admin: { email: string }) => admin.email),
    );
    const totalPages = Math.max(1, Math.ceil(totalAuditLogs / logPageSize));

    return NextResponse.json({
      admins,
      auditLogs,
      auditLogsMeta: {
        page: logPage,
        pageSize: logPageSize,
        total: totalAuditLogs,
        totalPages,
        query: logQuery,
        from: logFrom?.toISOString() || null,
        to: logTo?.toISOString() || null,
      },
      currentAdminEmail: currentAdmin?.email || null,
      currentAdminRole: currentAdmin
        ? toAdminRole(currentAdmin.role, currentAdmin.isMaster)
        : null,
      protectedMasterAdminEmail: PROTECTED_MASTER_ADMIN_EMAIL,
      currentAdminIsMaster: currentAdmin?.isMaster || false,
      isMasterDeployment: isMasterDeployment(),
      targetOrg,
      data: users.map((user: { email: string }) => ({
        ...user,
        isAdmin: adminEmailSet.has(user.email),
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load users: ${message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const body = (await request.json()) as PromotePayload;
    const currentAdmin = await getAdminUserFromRequest(request);
    const currentRole = currentAdmin
      ? toAdminRole(currentAdmin.role, currentAdmin.isMaster)
      : null;

    if (body.role && !isAdminRole(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const requestedRole = isAdminRole(body.role) ? body.role : "ADMIN";
    const isMasterRole = requestedRole === "MASTER_ADMIN";

    if (isMasterRole && !currentAdmin?.isMaster) {
      return NextResponse.json(
        { error: "Only a current master admin can grant master access" },
        { status: 403 },
      );
    }

    if (body.role && requestedRole !== "MASTER_ADMIN") {
      if (!currentRole || !hasAdminRoleAtLeast(currentRole, "MASTER_ADMIN")) {
        return NextResponse.json(
          { error: "Only a master admin can assign admin roles" },
          { status: 403 },
        );
      }
    }

    const sourcePath = getSourcePath(request);
    const requestIp = getRequestIp(request);
    const targetOrg = resolveAdminTargetOrg(
      request.nextUrl.searchParams.get("org"),
    );

    if (!body.userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const user = await prisma.registeredUser.findUnique({
      where: { id: body.userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.organizationId !== targetOrg) {
      return NextResponse.json(
        { error: "User not found for selected org" },
        { status: 404 },
      );
    }

    const isProtectedTargetEmail =
      user.email.trim().toLowerCase() === PROTECTED_MASTER_ADMIN_EMAIL;
    const actorEmail = currentAdmin?.email?.trim().toLowerCase() || "";
    if (isProtectedTargetEmail && actorEmail !== PROTECTED_MASTER_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "This protected account can only be managed by itself" },
        { status: 403 },
      );
    }

    const fullName =
      user.firstName || user.lastName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : user.name;

    const effectiveRole = isProtectedTargetEmail
      ? "MASTER_ADMIN"
      : requestedRole;
    const effectiveIsMasterRole = effectiveRole === "MASTER_ADMIN";

    const admin = await prisma.adminUser.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        name: fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        role: effectiveRole,
        isMaster: effectiveIsMasterRole,
        passwordHash: null,
      },
      update: {
        name: fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        role: effectiveRole,
        isMaster: effectiveIsMasterRole,
      },
    });

    await prisma.adminAuditLog.create({
      data: {
        action: "PROMOTE",
        actorAdminId: currentAdmin?.id || null,
        actorEmail: currentAdmin?.email || "unknown",
        targetAdminId: admin.id,
        targetRegisteredUserId: user.id,
        targetEmail: user.email,
        targetName: user.name,
        sourcePath,
        requestIp,
      },
    });

    if (effectiveIsMasterRole) {
      await prisma.adminAuditLog.create({
        data: {
          action: "GRANT_MASTER",
          actorAdminId: currentAdmin?.id || null,
          actorEmail: currentAdmin?.email || "unknown",
          targetAdminId: admin.id,
          targetRegisteredUserId: user.id,
          targetEmail: user.email,
          targetName: user.name,
          sourcePath,
          requestIp,
        },
      });
    }

    return NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to promote user: ${message}` },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const currentAdmin = await getAdminUserFromRequest(request);
    if (!currentAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentRole = currentAdmin
      ? toAdminRole(currentAdmin.role, currentAdmin.isMaster)
      : null;
    if (!currentRole || !hasAdminRoleAtLeast(currentRole, "MASTER_ADMIN")) {
      return NextResponse.json(
        { error: "Only a master admin can manage roles" },
        { status: 403 },
      );
    }

    const body = (await request.json()) as RoleUpdatePayload;
    if (!body.adminId || !isAdminRole(body.role)) {
      return NextResponse.json(
        { error: "adminId and role are required" },
        { status: 400 },
      );
    }

    const nextRole = body.role;
    const nextIsMaster = nextRole === "MASTER_ADMIN";

    const targetAdmin = await prisma.adminUser.findUnique({
      where: { id: body.adminId },
    });
    if (!targetAdmin) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    const targetEmail = targetAdmin.email.trim().toLowerCase();
    const actorEmail = currentAdmin.email.trim().toLowerCase();
    if (targetEmail === PROTECTED_MASTER_ADMIN_EMAIL) {
      if (actorEmail !== PROTECTED_MASTER_ADMIN_EMAIL) {
        return NextResponse.json(
          { error: "This protected account can only be managed by itself" },
          { status: 403 },
        );
      }

      if (nextRole !== "MASTER_ADMIN" || !nextIsMaster) {
        return NextResponse.json(
          { error: "This protected account is locked as Master Admin" },
          { status: 400 },
        );
      }
    }

    if (targetAdmin.id === currentAdmin.id && !nextIsMaster) {
      return NextResponse.json(
        { error: "You cannot remove your own master access" },
        { status: 400 },
      );
    }

    if (
      targetAdmin.role === nextRole &&
      targetAdmin.isMaster === nextIsMaster
    ) {
      return NextResponse.json({
        success: true,
        admin: {
          id: targetAdmin.id,
          email: targetAdmin.email,
          role: targetAdmin.role,
          isMaster: targetAdmin.isMaster,
        },
      });
    }

    const updatedAdmin = await prisma.adminUser.update({
      where: { id: targetAdmin.id },
      data: {
        role: nextRole,
        isMaster: nextIsMaster,
      },
    });

    if (targetAdmin.isMaster !== nextIsMaster) {
      await prisma.adminAuditLog.create({
        data: {
          action: nextIsMaster ? "GRANT_MASTER" : "REVOKE_MASTER",
          actorAdminId: currentAdmin.id,
          actorEmail: currentAdmin.email,
          targetAdminId: updatedAdmin.id,
          targetEmail: updatedAdmin.email,
          targetName: updatedAdmin.name,
          sourcePath: getSourcePath(request),
          requestIp: getRequestIp(request),
        },
      });
    }

    if (!nextIsMaster) {
      await prisma.adminSession.deleteMany({
        where: { userId: updatedAdmin.id },
      });
    }

    return NextResponse.json({
      success: true,
      admin: {
        id: updatedAdmin.id,
        email: updatedAdmin.email,
        role: updatedAdmin.role,
        isMaster: updatedAdmin.isMaster,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update master access: ${message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const body = (await request.json()) as DemotePayload;
    const sourcePath = getSourcePath(request);
    const requestIp = getRequestIp(request);
    const targetOrg = resolveAdminTargetOrg(
      request.nextUrl.searchParams.get("org"),
    );

    if (!body.adminId && !body.email) {
      return NextResponse.json(
        { error: "adminId or email is required" },
        { status: 400 },
      );
    }

    const currentAdmin = await getAdminUserFromRequest(request);

    const targetAdmin = body.adminId
      ? await prisma.adminUser.findUnique({ where: { id: body.adminId } })
      : await prisma.adminUser.findUnique({
          where: { email: (body.email || "").trim().toLowerCase() },
        });

    if (!targetAdmin) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    if (
      targetAdmin.email.trim().toLowerCase() === PROTECTED_MASTER_ADMIN_EMAIL
    ) {
      return NextResponse.json(
        { error: "This protected account is locked as Master Admin" },
        { status: 400 },
      );
    }

    if (currentAdmin && targetAdmin.email === currentAdmin.email) {
      return NextResponse.json(
        { error: "You cannot demote your own account" },
        { status: 400 },
      );
    }

    const linkedRegisteredUser = await prisma.registeredUser.findFirst({
      where: { organizationId: targetOrg, email: targetAdmin.email },
    });

    await prisma.adminAuditLog.create({
      data: {
        action: "DEMOTE",
        actorAdminId: currentAdmin?.id || null,
        actorEmail: currentAdmin?.email || "unknown",
        targetAdminId: targetAdmin.id,
        targetRegisteredUserId: linkedRegisteredUser?.id || null,
        targetEmail: targetAdmin.email,
        targetName: targetAdmin.name,
        sourcePath,
        requestIp,
      },
    });

    await prisma.adminSession.deleteMany({ where: { userId: targetAdmin.id } });
    await prisma.adminUser.delete({ where: { id: targetAdmin.id } });

    return NextResponse.json({
      success: true,
      demoted: {
        id: targetAdmin.id,
        email: targetAdmin.email,
        name: targetAdmin.name,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to demote admin: ${message}` },
      { status: 500 },
    );
  }
}
