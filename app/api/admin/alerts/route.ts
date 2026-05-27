import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/news/auth";
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

  const body = (await request.json()) as {
    organizationId?: string;
    allParksOut?: boolean;
    venues?: string[];
    expiresAt?: string;
  };

  if (!body.organizationId || !isContentOrgId(body.organizationId)) {
    return NextResponse.json({ error: "Invalid organizationId" }, { status: 400 });
  }
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (!expiresAt || isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
  }

  const alert = await prisma.orgAlert.create({
    data: {
      organizationId: body.organizationId,
      allParksOut: body.allParksOut ?? true,
      venues: body.venues ?? [],
      expiresAt,
    },
  });

  return NextResponse.json({ data: alert }, { status: 201 });
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
  return NextResponse.json({ ok: true });
}
