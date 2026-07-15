import { NextRequest, NextResponse } from "next/server";

import { parseBody } from "@/lib/api/parseBody";
import { authFailureResponse, jsonError } from "@/lib/api/respond";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { assertRoleKeyActive } from "@/lib/volunteers/roles";
import { volunteerProfilePatchSchema } from "@/lib/volunteers/schemas";
import { getVolunteerCard } from "@/lib/volunteers/service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) return authFailureResponse(auth);

  const { id } = await params;
  const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const card = await getVolunteerCard(id, organizationId);
  if (!card) return jsonError("Not found", 404);
  return NextResponse.json({ data: card });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) return authFailureResponse(auth);

  try {
    const { id } = await params;
    const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const existing = await prisma.volunteerProfile.findFirst({
      where: { id, organizationId },
    });
    if (!existing) return jsonError("Not found", 404);

    const rawBody: unknown = await request.json();
    const parsed = parseBody(volunteerProfilePatchSchema, rawBody);
    if (!parsed.ok) {
      return jsonError(parsed.error, 400, { issues: parsed.issues });
    }
    const body = parsed.data;

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
          skipDuplicates: true,
        });
      }
    }

    const card = await getVolunteerCard(id, organizationId);
    return NextResponse.json({ data: card });
  } catch (err: unknown) {
    console.error("[admin/volunteers PATCH]", err);
    return jsonError(err instanceof Error ? err.message : "Update failed", 500);
  }
}
