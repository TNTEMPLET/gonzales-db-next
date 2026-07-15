import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { getVolunteerCard } from "@/lib/volunteers/service";
import { type VolunteerRole, VOLUNTEER_ROLES } from "@/lib/volunteers/types";

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
      roles?: Array<{ role: string; teamId?: string | null }>;
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
      const roles = body.roles
        .map((r) => {
          const role = r.role.trim().toUpperCase();
          if (!(VOLUNTEER_ROLES as readonly string[]).includes(role)) return null;
          return { role: role as VolunteerRole, teamId: r.teamId ?? null };
        })
        .filter(Boolean) as Array<{ role: VolunteerRole; teamId: string | null }>;

      await prisma.volunteerRoleAssignment.deleteMany({
        where: { volunteerProfileId: id },
      });
      if (roles.length) {
        await prisma.volunteerRoleAssignment.createMany({
          data: roles.map((r) => ({
            volunteerProfileId: id,
            role: r.role,
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
