import { NextRequest, NextResponse } from "next/server";

import { authFailureResponse } from "@/lib/api/respond";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";
import { assertRoleKeyActive, listRoleDefs } from "@/lib/volunteers/roles";
import {
  ensureVolunteerProfile,
  listVolunteerCards,
  volunteerCardsToCsv,
} from "@/lib/volunteers/service";
import {
  type VolunteerRequirementKey,
  VOLUNTEER_REQUIREMENT_KEYS,
} from "@/lib/volunteers/types";

function parseRequirementKey(value: string | null): VolunteerRequirementKey | null {
  if (!value) return null;
  const key = value.trim().toUpperCase();
  return (VOLUNTEER_REQUIREMENT_KEYS as readonly string[]).includes(key)
    ? (key as VolunteerRequirementKey)
    : null;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) return authFailureResponse(auth);

  try {
    const query = request.nextUrl.searchParams;
    const organizationId = resolveAdminTargetOrg(query.get("org"));
    const seasonYearRaw = query.get("seasonYear");
    const seasonYear = seasonYearRaw
      ? Number(seasonYearRaw)
      : getSeasonConfigForOrg(organizationId as ContentOrgId).year;
    const readiness = query.get("readiness")?.trim() || null;
    const missing = parseRequirementKey(query.get("missing"));
    const role = query.get("role")?.trim().toUpperCase() || null;
    const search = query.get("search")?.trim() || null;
    const statusParam = query.get("status")?.toUpperCase();
    const status =
      statusParam === "INACTIVE" ? ("INACTIVE" as const) : ("ACTIVE" as const);
    const format = query.get("format")?.toLowerCase();
    const autoSync = query.get("autoSync") === "1";

    const cards = await listVolunteerCards({
      organizationId,
      seasonYear: Number.isFinite(seasonYear) ? seasonYear : undefined,
      status,
      readiness,
      missing,
      role,
      search,
      autoSync,
    });

    if (format === "csv") {
      const csv = volunteerCardsToCsv(cards);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="volunteers-${organizationId}-${seasonYear}.csv"`,
        },
      });
    }

    const roleCatalog = await listRoleDefs(false);

    const stats = {
      total: cards.length,
      ready: cards.filter((c) => c.readiness === "READY").length,
      incomplete: cards.filter((c) => c.readiness === "INCOMPLETE").length,
      expired: cards.filter((c) => c.readiness === "EXPIRED").length,
      blocked: cards.filter((c) => c.readiness === "BLOCKED").length,
      missingJdp: cards.filter((c) => {
        const j = c.requirements.find((r) => r.key === "JDP");
        return j && j.status !== "CLEAR" && j.status !== "WAIVED";
      }).length,
      missingAat: cards.filter((c) => {
        const a = c.requirements.find((r) => r.key === "ABUSE_AWARENESS");
        return a && a.status !== "CLEAR" && a.status !== "WAIVED";
      }).length,
    };

    return NextResponse.json({
      data: cards,
      stats,
      roles: roleCatalog.map((r) => ({
        id: r.id,
        key: r.key,
        label: r.label,
        isActive: r.isActive,
        sortOrder: r.sortOrder,
      })),
      seasonYear: Number.isFinite(seasonYear)
        ? seasonYear
        : getSeasonConfigForOrg(organizationId as ContentOrgId).year,
      organizationId,
    });
  } catch (err: unknown) {
    console.error("[admin/volunteers GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load volunteers" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) return authFailureResponse(auth);

  try {
    const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const body = (await request.json()) as {
      registeredUserId?: string;
      seasonYear?: number;
      roles?: Array<{ role?: string; roleKey?: string; teamId?: string | null }>;
      notes?: string | null;
    };

    if (!body.registeredUserId?.trim()) {
      return NextResponse.json({ error: "registeredUserId is required" }, { status: 400 });
    }

    const roles: Array<{ role: string; teamId: string | null }> = [];
    for (const r of body.roles || []) {
      const key = (r.roleKey || r.role || "").trim().toUpperCase();
      if (!key) continue;
      await assertRoleKeyActive(key);
      roles.push({ role: key, teamId: r.teamId ?? null });
    }

    const profile = await ensureVolunteerProfile({
      organizationId,
      registeredUserId: body.registeredUserId.trim(),
      seasonYear: body.seasonYear,
      roles: roles.length ? roles : [{ role: "OTHER_AP_POSITIONS", teamId: null }],
    });

    if (body.notes !== undefined) {
      const { default: prisma } = await import("@/lib/prisma");
      await prisma.volunteerProfile.update({
        where: { id: profile.id },
        data: { notes: body.notes?.trim() || null },
      });
    }

    const { getVolunteerCard } = await import("@/lib/volunteers/service");
    const card = await getVolunteerCard(profile.id, organizationId);
    return NextResponse.json({ data: card }, { status: 201 });
  } catch (err: unknown) {
    console.error("[admin/volunteers POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create volunteer" },
      { status: 500 },
    );
  }
}
