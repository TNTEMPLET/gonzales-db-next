import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureNewsAdmin } from "@/lib/news/auth";
import prisma from "@/lib/prisma";

type PromotePayload = {
  userId?: string;
};

type DemotePayload = {
  adminId?: string;
  email?: string;
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
  const auth = await ensureNewsAdmin(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const query = request.nextUrl.searchParams;
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

    const adminEmailSet = new Set(admins.map((admin) => admin.email));
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
      data: users.map((user) => ({
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
  const auth = await ensureNewsAdmin(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const currentAdmin = await getAdminUserFromRequest(request);
    const sourcePath = getSourcePath(request);
    const requestIp = getRequestIp(request);

    const body = (await request.json()) as PromotePayload;
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

    const fullName =
      user.firstName || user.lastName
        ? [user.firstName, user.lastName].filter(Boolean).join(" ")
        : user.name;

    const admin = await prisma.adminUser.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        name: fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        passwordHash: null,
      },
      update: {
        name: fullName,
        firstName: user.firstName,
        lastName: user.lastName,
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

export async function DELETE(request: NextRequest) {
  const auth = await ensureNewsAdmin(request);
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

    if (currentAdmin && targetAdmin.email === currentAdmin.email) {
      return NextResponse.json(
        { error: "You cannot demote your own account" },
        { status: 400 },
      );
    }

    const linkedRegisteredUser = await prisma.registeredUser.findUnique({
      where: { email: targetAdmin.email },
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
