import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { springCombinedSaveDenial } from "@/lib/admin/springCombined/save";
import { SPRING_LEAGUE_ORGS } from "@/lib/admin/springCombined/view";
import { cutoffSchema, divisionAgeSchema, MAX_DIVISION_COUNT } from "@/lib/ageDivisions/schema";
import {
  getSeasonDivisionAges,
  saveSpringCombinedDivisionAges,
  undoSpringCombinedDivisionAges,
} from "@/lib/ageDivisions/store";
import { ensureAdminModule, isMasterAdminActor } from "@/lib/auth/ensureAdminModule";
import { isMasterDeployment } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const saveBodySchema = z.object({
  seasonYear: z.number().int().min(1990).max(2200),
  cutoff: cutoffSchema,
  divisions: z.array(divisionAgeSchema).max(MAX_DIVISION_COUNT * 2),
});

const undoBodySchema = z.object({
  seasonYear: z.number().int().min(1990).max(2200),
});

/**
 * The one Spring write that is not the blanket 403. Master admins on the master
 * site only. Gonzales and Ascension are the only rows this route can change.
 */
async function authorize(request: NextRequest) {
  const auth = await ensureAdminModule(request, "DIVISION_AGES");
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ error: auth.message }, { status: auth.status }) };
  }
  const denial = springCombinedSaveDenial({
    authenticated: true,
    isMaster: isMasterAdminActor(auth),
    masterDeployment: isMasterDeployment(),
  });
  if (denial) {
    return { ok: false as const, response: NextResponse.json({ error: denial.error }, { status: denial.status }) };
  }
  return { ok: true as const, adminId: auth.admin.id };
}

export async function PUT(request: NextRequest) {
  const guard = await authorize(request);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  const parsed = saveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the divisions and try again." }, { status: 400 });
  }
  try {
    const leagues = await Promise.all(
      SPRING_LEAGUE_ORGS.map(async (organizationId) => {
        const view = await getSeasonDivisionAges(organizationId, parsed.data.seasonYear);
        return { organizationId, cutoff: view.cutoff, divisions: view.divisions };
      }),
    );
    const saved = await saveSpringCombinedDivisionAges(
      parsed.data.seasonYear,
      { cutoff: parsed.data.cutoff, divisions: parsed.data.divisions },
      leagues,
      guard.adminId,
    );
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error }, { status: saved.status });
    }
    return NextResponse.json({
      ok: true,
      seasonYear: parsed.data.seasonYear,
      organizationIds: ["gonzales", "ascension"],
      undoAvailable: true,
    });
  } catch (error) {
    console.error("[division-ages] combined spring save failed", error);
    return NextResponse.json({ error: "Could not save division ages." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await authorize(request);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  const parsed = undoBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a season year." }, { status: 400 });
  }
  try {
    const undone = await undoSpringCombinedDivisionAges(parsed.data.seasonYear, guard.adminId);
    if (!undone.ok) {
      return NextResponse.json({ error: undone.error }, { status: undone.status });
    }
    return NextResponse.json({
      ok: true,
      seasonYear: parsed.data.seasonYear,
      organizationIds: ["gonzales", "ascension"],
      undoAvailable: false,
    });
  } catch (error) {
    console.error("[division-ages] combined spring undo failed", error);
    return NextResponse.json({ error: "Could not undo the last save." }, { status: 500 });
  }
}
