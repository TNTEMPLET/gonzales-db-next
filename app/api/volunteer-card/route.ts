import { NextRequest, NextResponse } from "next/server";

import { hasAdminRoleAtLeast, toAdminRole } from "@/lib/auth/adminRoles";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { evaluateAccessBadgeEligibility } from "@/lib/volunteers/accessBadge";
import { resolveVolunteerCardActor } from "@/lib/volunteers/auth";
import { getMyVolunteerCard, setVolunteerAMark } from "@/lib/volunteers/service";

export const dynamic = "force-dynamic";

async function isRequestMasterAdmin(request: NextRequest): Promise<boolean> {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) return false;
  if (admin.isMaster) return true;
  // Under the new model, a non-master reaching here with MASTER_ADMIN intent is impossible via role column.
  // Real master power comes from isMaster flag (or explicit MASTER_ADMIN membership, but isMaster is the signal).
  return false;
}

/**
 * Self-serve volunteer card for the signed-in coach/volunteer.
 * Admin notes are stripped; access-badge eligibility is included for future gates.
 */
export async function GET(request: NextRequest) {
  const actor = await resolveVolunteerCardActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seasonYearParam = request.nextUrl.searchParams.get("seasonYear");
  const parsed = seasonYearParam ? Number(seasonYearParam) : Number.NaN;
  const seasonYear = Number.isFinite(parsed) ? parsed : undefined;
  const masterAdmin = await isRequestMasterAdmin(request);

  try {
    const card = await getMyVolunteerCard({
      organizationId: actor.targetOrg,
      registeredUserId: actor.registeredUserId,
      seasonYear,
      ensureIfCoach: true,
    });

    if (!card) {
      return NextResponse.json(
        {
          data: null,
          accessBadge: null,
          canToggleA: masterAdmin,
          message:
            "No volunteer card for this season. Contact your league admin if you should have one.",
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    // Never expose admin-only notes on the self-serve surface.
    const publicCard = { ...card, notes: null };
    const accessBadge = evaluateAccessBadgeEligibility(publicCard);

    return NextResponse.json(
      {
        data: publicCard,
        accessBadge,
        canToggleA: masterAdmin,
        actor: {
          registeredUserId: actor.registeredUserId,
          isAdmin: actor.isAdmin,
          targetOrg: actor.targetOrg,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load volunteer card";
    console.error("[volunteer-card GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Master Admin only — toggle opaque A mark on the caller's card for this org. */
export async function PATCH(request: NextRequest) {
  if (!(await isRequestMasterAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = await resolveVolunteerCardActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { aMark?: unknown };
  try {
    body = (await request.json()) as { aMark?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.aMark !== "boolean") {
    return NextResponse.json({ error: "aMark required" }, { status: 400 });
  }

  try {
    const existing = await getMyVolunteerCard({
      organizationId: actor.targetOrg,
      registeredUserId: actor.registeredUserId,
      ensureIfCoach: true,
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const card = await setVolunteerAMark({
      volunteerProfileId: existing.id,
      organizationId: actor.targetOrg,
      aMark: body.aMark,
    });
    if (!card) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const publicCard = { ...card, notes: null };
    return NextResponse.json(
      {
        data: publicCard,
        accessBadge: evaluateAccessBadgeEligibility(publicCard),
        canToggleA: true,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    console.error("[volunteer-card PATCH]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
