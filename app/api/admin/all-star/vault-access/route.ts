import { NextRequest, NextResponse } from "next/server";

import { recordAllStarAuditLog } from "@/lib/allStar/auditLog";
import { ensureAllStarVaultAccess, ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import prisma from "@/lib/prisma";
import { isMasterDeployment, resolveAdminTargetOrg } from "@/lib/siteConfig";

function getAllStarVaultAccessModel() {
  const model = (prisma as unknown as { allStarVaultAccess?: typeof prisma.allStarVaultAccess })
    .allStarVaultAccess;
  if (!model) {
    throw new Error(
      "Prisma client is out of date for All-Star models. Run `npm run prisma:generate` and restart the dev server.",
    );
  }
  return model;
}


export async function GET(request: NextRequest) {
  try {
    const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

    const org = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    if (!org) {
      return NextResponse.json({ error: "org is required" }, { status: 400 });
    }

    const allStarVaultAccess = getAllStarVaultAccessModel();
    // Order by updatedAt only: composite enum+date orderBy has triggered Prisma validation errors
    // with some client/driver-adapter combinations.
    const explicitAccess = await allStarVaultAccess.findMany({
      where: { organizationId: org },
      select: {
        id: true,
        registeredUserId: true,
        organizationId: true,
        role: true,
        grantedByAdminId: true,
        createdAt: true,
        updatedAt: true,
        registeredUser: {
          select: { id: true, email: true, firstName: true, lastName: true, name: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const adminDefaults = await prisma.adminUser.findMany({
      where: {},
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        isMaster: true,
        firstName: true,
        lastName: true,
        name: true,
      },
    });
    const explicitIds = new Set(explicitAccess.map((entry) => entry.registeredUserId));
    const implicitRows = await Promise.all(
      adminDefaults
        .filter(
          (admin) =>
            admin.isMaster &&
            hasAdminRoleAtLeast(toAdminRole(admin.role, admin.isMaster), "ADMIN"),
        )
        .map(async (admin) => {
          const registeredUser = await prisma.registeredUser.findFirst({
            where: { email: { equals: admin.email, mode: "insensitive" } },
            orderBy: { updatedAt: "desc" },
            select: { id: true, email: true, firstName: true, lastName: true, name: true },
          });
          if (!registeredUser || explicitIds.has(registeredUser.id)) return null;
          return {
            id: `implicit-${org}-${registeredUser.id}`,
            organizationId: org,
            role: "FULL_ACCESS" as const,
            registeredUserId: registeredUser.id,
            grantedByAdminId: null,
            createdAt: null,
            updatedAt: null,
            registeredUser,
            isImplicit: true,
          };
        }),
    );

    const data = [
      ...explicitAccess.map((entry) => ({ ...entry, isImplicit: false })),
      ...implicitRows.filter(Boolean),
    ];

    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to load vault access: ${message}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await ensureAllStarVaultAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

    const body = (await request.json()) as {
      registeredUserId?: string;
      organizationId?: string;
      role?: "FULL_ACCESS" | "LIMITED_ADMIN";
    };
    const organizationId = resolveAdminTargetOrg(body.organizationId);
    if (!body.registeredUserId || !body.role || !organizationId) {
      return NextResponse.json(
        { error: "registeredUserId, organizationId, and role are required" },
        { status: 400 },
      );
    }

    const admin = await getAdminUserFromRequest(request);
    const allStarVaultAccess = getAllStarVaultAccessModel();
    const existingForTarget = await allStarVaultAccess.findUnique({
      where: {
        registeredUserId_organizationId: {
          registeredUserId: body.registeredUserId,
          organizationId,
        },
      },
    });
    if (!existingForTarget && isMasterDeployment()) {
      return NextResponse.json(
        {
          error:
            "New vault access must be granted from the organization’s admin site. You can change or remove existing access here.",
        },
        { status: 403 },
      );
    }

    const beforeState = existingForTarget
      ? {
          exists: true,
          registeredUserId: existingForTarget.registeredUserId,
          organizationId: existingForTarget.organizationId,
          role: existingForTarget.role,
          grantedByAdminId: existingForTarget.grantedByAdminId,
        }
      : {
          exists: false,
          registeredUserId: body.registeredUserId,
          organizationId,
        };

    const data = await allStarVaultAccess.upsert({
      where: {
        registeredUserId_organizationId: {
          registeredUserId: body.registeredUserId,
          organizationId,
        },
      },
      create: {
        registeredUserId: body.registeredUserId,
        organizationId,
        role: body.role,
        grantedByAdminId: admin?.id || null,
      },
      update: {
        role: body.role,
        grantedByAdminId: admin?.id || null,
      },
    });

    await recordAllStarAuditLog({
      organizationId,
      entityType: "vault_access",
      entityId: data.id,
      action: "VAULT_ACCESS_UPSERT",
      summary: existingForTarget
        ? `Updated vault access to ${body.role}`
        : `Granted vault access (${body.role})`,
      beforeState,
      afterState: {
        exists: true,
        registeredUserId: data.registeredUserId,
        organizationId: data.organizationId,
        role: data.role,
        grantedByAdminId: data.grantedByAdminId,
      },
      request,
    });

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to update vault access: ${message}` }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await ensureAllStarVaultAdmin(request);
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

    const body = (await request.json()) as {
      registeredUserId?: string;
      organizationId?: string;
    };
    const organizationId = resolveAdminTargetOrg(body.organizationId);
    if (!body.registeredUserId || !organizationId) {
      return NextResponse.json(
        { error: "registeredUserId and organizationId are required" },
        { status: 400 },
      );
    }

    const allStarVaultAccess = getAllStarVaultAccessModel();
    const existing = await allStarVaultAccess.findUnique({
      where: {
        registeredUserId_organizationId: {
          registeredUserId: body.registeredUserId,
          organizationId,
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Vault access not found" }, { status: 404 });
    }

    await allStarVaultAccess.delete({
      where: {
        registeredUserId_organizationId: {
          registeredUserId: body.registeredUserId,
          organizationId,
        },
      },
    });

    await recordAllStarAuditLog({
      organizationId,
      entityType: "vault_access",
      entityId: existing.id,
      action: "VAULT_ACCESS_REVOKED",
      summary: `Revoked vault access (${existing.role})`,
      beforeState: {
        exists: true,
        registeredUserId: existing.registeredUserId,
        organizationId: existing.organizationId,
        role: existing.role,
        grantedByAdminId: existing.grantedByAdminId,
      },
      afterState: null,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to revoke vault access: ${message}` }, { status: 500 });
  }
}
