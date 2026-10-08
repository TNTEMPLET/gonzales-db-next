import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { ensureAdminModule } from "@/lib/news/auth";
import { setOrgRainout } from "@/lib/rainout/apply";
import { revalidateRainoutPaths } from "@/lib/rainout/revalidate";
import { decideRainoutWrite, type RainoutActor } from "@/lib/rainout/writeAccess";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

function rainoutDenied(message: string, status: 403) {
  return NextResponse.json({ error: message }, { status });
}

/** Session plus the park-alert role decision for one league. */
async function parkAlertWriter(request: NextRequest, organizationId: ContentOrgId) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const role = await getEffectiveAdminRoleForOrg(adminUser.id, adminUser.isMaster, organizationId);
  const actor: RainoutActor = { isMaster: adminUser.isMaster, role };
  const decision = decideRainoutWrite({ ...actor, path: "park-alerts" });
  if (!decision.allowed) {
    return { ok: false as const, response: rainoutDenied(decision.message, decision.status) };
  }
  return { ok: true as const, adminUser, actor };
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "PARK_ALERTS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message ?? "Unauthorized" }, { status: auth.status });
  }

  const org = request.nextUrl.searchParams.get("org");
  const alerts = await prisma.orgAlert.findMany({
    where: {
      ...(org && isContentOrgId(org) ? { organizationId: org } : {}),
      expiresAt: { gt: new Date() },
    },
    orderBy: [{ organizationId: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ data: alerts });
}

export async function POST(request: NextRequest) {
  const authOrg = resolveAuthOrganizationId(request);
  const writer = await parkAlertWriter(request, authOrg);
  if (!writer.ok) return writer.response;

  const auth = await ensureAdminModule(request, "PARK_ALERTS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message ?? "Unauthorized" }, { status: auth.status });
  }

  const body = (await request.json().catch(() => null)) as {
    organizationId?: string;
    allParksOut?: boolean;
    venues?: unknown;
    expiresAt?: string;
  } | null;

  if (!body?.organizationId || !isContentOrgId(body.organizationId)) {
    return NextResponse.json({ error: "Invalid organizationId" }, { status: 400 });
  }

  if (body.organizationId !== authOrg) {
    const targetRole = await getEffectiveAdminRoleForOrg(
      writer.adminUser.id,
      writer.adminUser.isMaster,
      body.organizationId,
    );
    if (targetRole === "PARK_DIRECTOR") {
      const decision = decideRainoutWrite({
        isMaster: writer.adminUser.isMaster,
        role: "PARK_DIRECTOR",
        otherRoles: writer.actor.role ? [writer.actor.role] : [],
        path: "park-alerts",
      });
      if (!decision.allowed) return rainoutDenied(decision.message, decision.status);
    }
  }

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
  }

  const parks = Array.isArray(body.venues)
    ? body.venues.filter((venue): venue is string => typeof venue === "string")
    : [];
  const result = await setOrgRainout({
    organizationId: body.organizationId,
    allParksOut: body.allParksOut ?? true,
    parks,
    expiresAt,
    actorAdminId: auth.admin.id,
    actor: writer.actor,
    path: "park-alerts",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json({ data: result.alert, summary: result.summary }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const authOrg = resolveAuthOrganizationId(request);
  const writer = await parkAlertWriter(request, authOrg);
  if (!writer.ok) return writer.response;

  const auth = await ensureAdminModule(request, "PARK_ALERTS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message ?? "Unauthorized" }, { status: auth.status });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const existing = await prisma.orgAlert.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isContentOrgId(existing.organizationId)) {
    return NextResponse.json({ error: "Unknown league." }, { status: 400 });
  }
  if (existing.organizationId !== authOrg) {
    const targetRole = await getEffectiveAdminRoleForOrg(
      writer.adminUser.id,
      writer.adminUser.isMaster,
      existing.organizationId,
    );
    if (targetRole === "PARK_DIRECTOR") {
      const decision = decideRainoutWrite({
        isMaster: writer.adminUser.isMaster,
        role: "PARK_DIRECTOR",
        otherRoles: writer.actor.role ? [writer.actor.role] : [],
        path: "park-alerts",
      });
      if (!decision.allowed) return rainoutDenied(decision.message, decision.status);
    }
  }

  await prisma.orgAlert.delete({ where: { id } });
  revalidateRainoutPaths();
  return NextResponse.json({ ok: true });
}
