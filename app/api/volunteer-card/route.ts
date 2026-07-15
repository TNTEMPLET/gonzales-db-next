import { NextRequest, NextResponse } from "next/server";

import { evaluateAccessBadgeEligibility } from "@/lib/volunteers/accessBadge";
import { resolveVolunteerCardActor } from "@/lib/volunteers/auth";
import { getMyVolunteerCard } from "@/lib/volunteers/service";

export const dynamic = "force-dynamic";

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
