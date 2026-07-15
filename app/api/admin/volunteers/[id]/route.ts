import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { assertRoleKeyActive } from "@/lib/volunteers/roles";
import { getVolunteerCard } from "@/lib/volunteers/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const { id } = await params;
  const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const card = await getVolunteerCard(id, organizationId);
  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data: card });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const existing = await prisma.volunteerProfile.findFirst({
      where: { id, organizationId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      notes?: string | null;
      status?: "ACTIVE" | "INACTIVE";
      roles?: Array<{ role?: string; roleKey?: string; teamId?: string | null }>;
    };

    if (body.notes !== undefined || body.status !== undefined) {
      await prisma.volunteerProfile.update({
        where: { id },
        data: {
          ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
          ...(body.status === "ACTIVE" || body.status === "INACTIVE"
            ? { status: body.status }
            : {}),
        },
      });
    }

    if (body.roles) {
      const roles: Array<{ roleKey: string; teamId: string | null }> = [];
      for (const r of body.roles) {
        const key = (r.roleKey || r.role || "").trim().toUpperCase();
        if (!key) continue;
        await assertRoleKeyActive(key);
        roles.push({ roleKey: key, teamId: r.teamId ?? null });
      }

      await prisma.volunteerRoleAssignment.deleteMany({
        where: { volunteerProfileId: id },
      });
      if (roles.length) {
        await prisma.volunteerRoleAssignment.createMany({
          data: roles.map((r) => ({
            volunteerProfileId: id,
            roleKey: r.roleKey,
            teamId: r.teamId,
          })),
        });
      }
    }

    const card = await getVolunteerCard(id, organizationId);
    return NextResponse.json({ data: card });
  } catch (err: unknown) {
    console.error("[admin/volunteers PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 },
    );
  }
}
