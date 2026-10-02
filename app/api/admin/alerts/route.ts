import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/news/auth";
import { setOrgRainout } from "@/lib/rainout/apply";
import { revalidateRainoutPaths } from "@/lib/rainout/revalidate";
import { isContentOrgId } from "@/lib/siteConfig";

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
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.alert, summary: result.summary }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
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

  await prisma.orgAlert.delete({ where: { id } });
  revalidateRainoutPaths();
  return NextResponse.json({ ok: true });
}
