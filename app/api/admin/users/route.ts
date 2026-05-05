import { NextRequest, NextResponse } from "next/server";

import { getEffectiveAdminRoleForOrg, syncAdminUserAggregateRole } from "@/lib/auth/effectiveAdminRole";
import {
  hasAdminRoleAtLeast,
  isAdminRole,
  isAssignableOnlyOnMasterSite,
  PROTECTED_MASTER_ADMIN_EMAIL,
  toAdminRole,
  type AdminRole,
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

    const [users, currentAdmin, auditLogs, totalAuditLogs, latestImportBatch, orgMemberships, masterAdmins] =
      await Promise.all([
        prisma.registeredUser.findMany({
          where: { organizationId: targetOrg },
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
        prisma.coachImportBatch.findFirst({
          where: { organizationId: targetOrg, undoneAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            createdAt: true,
            createdCount: true,
            updatedCount: true,
            processedCount: true,
            skippedCount: true,
            createdByEmail: true,
          },
        }),
        prisma.adminOrgMembership.findMany({
          where: { organizationId: targetOrg },
          include: { adminUser: true },
          orderBy: { updatedAt: "desc" },
        }),
        prisma.adminUser.findMany({
          where: { isMaster: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const userIds = users.map((user) => user.id);
    const coachAssignments =
      userIds.length === 0
        ? []
        : await prisma.teamCoachAssignment.findMany({
            where: {
              registeredUserId: { in: userIds },
              team: { organizationId: targetOrg },
            },
            include: {
              team: {
                select: {
                  teamName: true,
                  ageGroup: true,
                  seasonYear: true,
                },
              },
            },
            orderBy: [{ team: { seasonYear: "desc" } }, { createdAt: "desc" }],
          });

    type CoachTeamRow = {
      ageGroup: string;
      teamName: string;
      role: "HEAD_COACH" | "ASSISTANT_COACH";
      seasonYear: number;
    };

    const coachTeamAssignmentsByUserId = new Map<string, CoachTeamRow[]>();
    const coachRoleByUserId = new Map<string, "HEAD_COACH" | "ASSISTANT_COACH">();

    for (const assignment of coachAssignments) {
      const uid = assignment.registeredUserId;

      const prev = coachRoleByUserId.get(uid);
      coachRoleByUserId.set(
        uid,
        assignment.role === "HEAD_COACH" || prev === "HEAD_COACH" ? "HEAD_COACH" : "ASSISTANT_COACH",
      );

      if (!coachTeamAssignmentsByUserId.has(uid)) coachTeamAssignmentsByUserId.set(uid, []);
      coachTeamAssignmentsByUserId.get(uid)!.push({
        ageGroup: assignment.team.ageGroup.trim(),
        teamName: assignment.team.teamName.trim(),
        role: assignment.role,
        seasonYear: assignment.team.seasonYear,
      });
    }

    for (const rows of coachTeamAssignmentsByUserId.values()) {
      rows.sort((a, b) =>
        b.seasonYear !== a.seasonYear
          ? b.seasonYear - a.seasonYear
          : a.teamName.localeCompare(b.teamName, undefined, { sensitivity: "base" }),
      );
    }

    const memberIds = new Set(orgMemberships.map((m) => m.adminUserId));
    const admins = [
      ...orgMemberships.map((m) => {
        const u = m.adminUser;
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          firstName: u.firstName,
          lastName: u.lastName,
          role: (u.isMaster ? "MASTER_ADMIN" : m.role) as AdminRole,
          orgRole: u.isMaster ? null : m.role,
          isMaster: u.isMaster,
          createdAt: u.createdAt.toISOString(),
        };
      }),
      ...masterAdmins
        .filter((a) => !memberIds.has(a.id))
        .map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          firstName: u.firstName,
          lastName: u.lastName,
          role: "MASTER_ADMIN" as const,
          orgRole: null,
          isMaster: true,
          createdAt: u.createdAt.toISOString(),
        })),
    ];

    const adminEmailSet = new Set<string>();
    for (const m of orgMemberships) {
      adminEmailSet.add(m.adminUser.email.trim().toLowerCase());
    }
    for (const a of masterAdmins) {
      adminEmailSet.add(a.email.trim().toLowerCase());
    }

    const currentAdminOrgRole = currentAdmin
      ? await getEffectiveAdminRoleForOrg(
          currentAdmin.id,
          currentAdmin.isMaster,
          targetOrg,
        )
      : null;
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
      currentAdminOrgRole,
      protectedMasterAdminEmail: PROTECTED_MASTER_ADMIN_EMAIL,
      currentAdminIsMaster: currentAdmin?.isMaster || false,
      isMasterDeployment: isMasterDeployment(),
      targetOrg,
      latestImportBatch,
      data: users.map((user: { id: string; email: string }) => ({
        ...user,
        isAdmin: adminEmailSet.has(user.email.trim().toLowerCase()),
        coachRole: coachRoleByUserId.get(user.id) || null,
        coachTeamAssignments: coachTeamAssignmentsByUserId.get(user.id) ?? [],
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
    const targetOrg = resolveAdminTargetOrg(
      request.nextUrl.searchParams.get("org"),
    );
    const actorOrgRole = currentAdmin
      ? await getEffectiveAdminRoleForOrg(
          currentAdmin.id,
          currentAdmin.isMaster,
          targetOrg,
        )
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

    if (isAssignableOnlyOnMasterSite(requestedRole) && !currentAdmin?.isMaster) {
      return NextResponse.json(
        {
          error:
            "Park Director and Board Member roles can only be assigned from the Master Admin site by a Master Admin",
        },
        { status: 403 },
      );
    }

    if (!isMasterRole && !currentAdmin?.isMaster) {
      if (requestedRole !== "ADMIN") {
        return NextResponse.json(
          { error: "Organization admins can only grant Site Admin (Admin) access" },
          { status: 403 },
        );
      }
      if (!actorOrgRole || !hasAdminRoleAtLeast(actorOrgRole, "ADMIN")) {
        return NextResponse.json(
          { error: "You must be a Site Admin for this organization to grant admin access" },
          { status: 403 },
        );
      }
    }

    const sourcePath = getSourcePath(request);
    const requestIp = getRequestIp(request);

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

    let admin;

    if (effectiveIsMasterRole) {
      admin = await prisma.adminUser.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          name: fullName,
          firstName: user.firstName,
          lastName: user.lastName,
          role: "MASTER_ADMIN",
          isMaster: true,
          passwordHash: null,
        },
        update: {
          name: fullName,
          firstName: user.firstName,
          lastName: user.lastName,
          role: "MASTER_ADMIN",
          isMaster: true,
        },
      });
    } else {
      admin = await prisma.adminUser.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          name: fullName,
          firstName: user.firstName,
          lastName: user.lastName,
          role: "ADMIN",
          isMaster: false,
          passwordHash: null,
        },
        update: {
          name: fullName,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });

      await prisma.adminOrgMembership.upsert({
        where: {
          adminUserId_organizationId: {
            adminUserId: admin.id,
            organizationId: targetOrg,
          },
        },
        create: {
          adminUserId: admin.id,
          organizationId: targetOrg,
          role: effectiveRole,
        },
        update: { role: effectiveRole },
      });

      await syncAdminUserAggregateRole(admin.id);
    }

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

    const body = (await request.json()) as RoleUpdatePayload & {
      organizationId?: string;
    };
    const targetOrg = resolveAdminTargetOrg(
      body.organizationId ?? request.nextUrl.searchParams.get("org"),
    );

    if (!body.adminId || !isAdminRole(body.role)) {
      return NextResponse.json(
        { error: "adminId and role are required" },
        { status: 400 },
      );
    }

    const targetAdmin = await prisma.adminUser.findUnique({
      where: { id: body.adminId },
    });
    if (!targetAdmin) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }

    const nextRole = body.role;
    const nextIsMaster = nextRole === "MASTER_ADMIN";

    const actorOrgRole = await getEffectiveAdminRoleForOrg(
      currentAdmin.id,
      currentAdmin.isMaster,
      targetOrg,
    );
    if (!actorOrgRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetEmail = targetAdmin.email.trim().toLowerCase();
    const actorEmail = currentAdmin.email.trim().toLowerCase();

    // Platform Master Admin accounts (global — only Master Admins)
    if (targetAdmin.isMaster || nextIsMaster) {
      if (!currentAdmin.isMaster) {
        return NextResponse.json(
          { error: "Only a Master Admin can change Master Admin accounts" },
          { status: 403 },
        );
      }

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
    }

    if (!currentAdmin.isMaster) {
      if (!hasAdminRoleAtLeast(actorOrgRole, "ADMIN")) {
        return NextResponse.json(
          { error: "You must be a Site Admin for this organization" },
          { status: 403 },
        );
      }
      if (isAssignableOnlyOnMasterSite(nextRole) || nextRole !== "ADMIN") {
        return NextResponse.json(
          {
            error:
              "Organization admins can only assign Site Admin for this organization. Park Director and Board Member are assigned by Master Admin.",
          },
          { status: 403 },
        );
      }
    }

    if (targetEmail === PROTECTED_MASTER_ADMIN_EMAIL && actorEmail !== PROTECTED_MASTER_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "This protected account can only be managed by itself" },
        { status: 403 },
      );
    }

    const existingMembership = await prisma.adminOrgMembership.findUnique({
      where: {
        adminUserId_organizationId: {
          adminUserId: targetAdmin.id,
          organizationId: targetOrg,
        },
      },
    });

    if (existingMembership && existingMembership.role === nextRole) {
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

    await prisma.adminOrgMembership.upsert({
      where: {
        adminUserId_organizationId: {
          adminUserId: targetAdmin.id,
          organizationId: targetOrg,
        },
      },
      create: {
        adminUserId: targetAdmin.id,
        organizationId: targetOrg,
        role: nextRole,
      },
      update: { role: nextRole },
    });

    await syncAdminUserAggregateRole(targetAdmin.id);

    const refreshed = await prisma.adminUser.findUnique({
      where: { id: targetAdmin.id },
    });

    return NextResponse.json({
      success: true,
      admin: {
        id: refreshed!.id,
        email: refreshed!.email,
        role: refreshed!.role,
        isMaster: refreshed!.isMaster,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update admin role: ${message}` },
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

    if (targetAdmin.isMaster) {
      return NextResponse.json(
        {
          error:
            "Master Admin accounts cannot be removed from organization user management. Use the Master Admin site.",
        },
        { status: 400 },
      );
    }

    if (
      targetAdmin.email.trim().toLowerCase() === PROTECTED_MASTER_ADMIN_EMAIL
    ) {
      return NextResponse.json(
        { error: "This protected account is locked as Master Admin" },
        { status: 400 },
      );
    }

    if (!currentAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actorOrgRole = await getEffectiveAdminRoleForOrg(
      currentAdmin.id,
      currentAdmin.isMaster,
      targetOrg,
    );
    if (!actorOrgRole || !hasAdminRoleAtLeast(actorOrgRole, "ADMIN")) {
      return NextResponse.json(
        { error: "You must be a Site Admin for this organization" },
        { status: 403 },
      );
    }

    if (currentAdmin && targetAdmin.email === currentAdmin.email) {
      return NextResponse.json(
        { error: "You cannot demote your own account" },
        { status: 400 },
      );
    }

    const removedMemberships = await prisma.adminOrgMembership.deleteMany({
      where: {
        adminUserId: targetAdmin.id,
        organizationId: targetOrg,
      },
    });
    if (removedMemberships.count === 0) {
      return NextResponse.json(
        { error: "This admin is not assigned to this organization" },
        { status: 404 },
      );
    }

    let linkedRegisteredUser = await prisma.registeredUser.findFirst({
      where: {
        organizationId: targetOrg,
        email: { equals: targetAdmin.email, mode: "insensitive" },
      },
    });

    if (!linkedRegisteredUser) {
      linkedRegisteredUser = await prisma.registeredUser.create({
        data: {
          organizationId: targetOrg,
          email: targetAdmin.email.trim().toLowerCase(),
          name: targetAdmin.name,
          firstName: targetAdmin.firstName,
          lastName: targetAdmin.lastName,
          isCoach: false,
          isBlocked: false,
          ageGroup: null,
          assignedTeam: null,
        },
      });
    }

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

    const remainingMemberships = await prisma.adminOrgMembership.count({
      where: { adminUserId: targetAdmin.id },
    });

    if (remainingMemberships === 0) {
      await prisma.adminSession.deleteMany({ where: { userId: targetAdmin.id } });
      await prisma.adminUser.delete({ where: { id: targetAdmin.id } });
    } else {
      await syncAdminUserAggregateRole(targetAdmin.id);
    }

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
