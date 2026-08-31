import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";
import { getHeadCoachForTeam } from "@/lib/teams/headCoach";
import { getDefaultKitLabel } from "@/lib/admin/equipmentKitDefaults";

export const dynamic = "force-dynamic";

function coachDisplayName(u: { firstName: string | null; lastName: string | null; name: string | null } | null) {
  if (!u) return null;
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.name || null;
}

/**
 * GET /api/admin/teams/equipment-checkout?org=...&seasonYear=...&ageGroup=...
 * Lists checkout rows for a division, joined to team name + head coach.
 */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const organizationId = request.nextUrl.searchParams.get("org");
  const seasonYearParam = request.nextUrl.searchParams.get("seasonYear");
  const ageGroup = request.nextUrl.searchParams.get("ageGroup");
  const seasonYear = seasonYearParam ? Number(seasonYearParam) : Number.NaN;
  if (!organizationId || !Number.isFinite(seasonYear) || !ageGroup) {
    return NextResponse.json({ error: "org, seasonYear, and ageGroup are required" }, { status: 400 });
  }

  const checkouts = await prisma.equipmentCheckout.findMany({
    where: { organizationId, seasonYear, ageGroup },
    orderBy: { createdAt: "asc" },
    include: {
      team: {
        select: {
          teamName: true,
          coachAssignments: {
            select: { role: true, registeredUser: { select: { id: true, firstName: true, lastName: true, name: true, email: true } } },
          },
        },
      },
    },
  });

  return NextResponse.json({
    checkouts: checkouts.map((c) => ({
      id: c.id,
      teamId: c.teamId,
      teamName: c.team.teamName,
      headCoachName: coachDisplayName(getHeadCoachForTeam(c.team.coachAssignments)),
      kitLabel: c.kitLabel,
      status: c.status,
      pickedUpAt: c.pickedUpAt?.toISOString() ?? null,
      notes: c.notes,
    })),
  });
}

/**
 * POST { action: "generate", organizationId, seasonYear, ageGroup }
 * Bulk-creates one EquipmentCheckout row per real Team in the division
 * that doesn't already have one, auto-resolving the head coach and
 * defaulting the kit label from getDefaultKitLabel().
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await request.json();
  const { action, organizationId, seasonYear, ageGroup } = body as {
    action?: string;
    organizationId?: string;
    seasonYear?: number;
    ageGroup?: string;
  };

  if (action !== "generate" || !organizationId || !seasonYear || !ageGroup) {
    return NextResponse.json({ error: "action=generate, organizationId, seasonYear, and ageGroup are required" }, { status: 400 });
  }

  const teams = await prisma.team.findMany({
    where: { organizationId, seasonYear, ageGroup },
    select: {
      id: true,
      equipmentCheckout: { select: { id: true } },
      coachAssignments: {
        select: { role: true, registeredUser: { select: { id: true } } },
      },
    },
  });

  const defaultKitLabel = getDefaultKitLabel(ageGroup);
  const toCreate = teams.filter((t) => !t.equipmentCheckout);

  await prisma.$transaction(
    toCreate.map((team) =>
      prisma.equipmentCheckout.create({
        data: {
          organizationId,
          seasonYear,
          ageGroup,
          teamId: team.id,
          assignedCoachId: getHeadCoachForTeam(team.coachAssignments)?.id ?? null,
          kitLabel: defaultKitLabel,
        },
      }),
    ),
  );

  return NextResponse.json({ created: toCreate.length, skipped: teams.length - toCreate.length });
}

/**
 * PATCH { checkoutId, status } -- same shape/semantics as the Cap/Shirt
 * order fulfillment toggle (app/api/admin/cap-orders/route.ts).
 */
export async function PATCH(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = await request.json();
  const { checkoutId, status, kitLabel } = body as {
    checkoutId?: string;
    status?: "open" | "picked_up";
    kitLabel?: string;
  };
  if (!checkoutId) {
    return NextResponse.json({ error: "checkoutId is required" }, { status: 400 });
  }
  if (status === undefined && kitLabel === undefined) {
    return NextResponse.json({ error: "status or kitLabel is required" }, { status: 400 });
  }

  const updated = await prisma.equipmentCheckout.update({
    where: { id: checkoutId },
    data: {
      ...(status !== undefined ? { status, pickedUpAt: status === "picked_up" ? new Date() : null } : {}),
      ...(kitLabel !== undefined ? { kitLabel } : {}),
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    pickedUpAt: updated.pickedUpAt?.toISOString() ?? null,
    kitLabel: updated.kitLabel,
  });
}
