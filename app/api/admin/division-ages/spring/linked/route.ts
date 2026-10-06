import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { loadRemovalImpacts } from "@/lib/admin/springCombined/removalCounts";
import { springCombinedSaveDenial } from "@/lib/admin/springCombined/save";
import { MAX_DIVISION_COUNT } from "@/lib/ageDivisions/schema";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { isMasterDeployment } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  seasonYear: z.number().int().min(1990).max(2200),
  divisions: z
    .array(
      z.object({
        organizationId: z.enum(["gonzales", "ascension"]),
        code: z
          .string()
          .min(1)
          .max(40)
          .refine((value) => value.trim().length > 0, "Enter a division code."),
        label: z.string().max(80),
      }),
    )
    .max(MAX_DIVISION_COUNT * 2),
});

/**
 * Read-only companion to the combined Spring save. Returns how many live
 * registrations, teams, and drafts still use each removed division's label
 * or code. It does not write division ages or those rows.
 */
async function authorize(request: NextRequest) {
  const auth = await ensureAdminModule(request, "DIVISION_AGES");
  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ error: auth.message }, { status: auth.status }) };
  }
  const denial = springCombinedSaveDenial({
    authenticated: true,
    isMaster: auth.admin.isMaster,
    masterDeployment: isMasterDeployment(),
  });
  if (denial) {
    return { ok: false as const, response: NextResponse.json({ error: denial.error }, { status: denial.status }) };
  }
  return { ok: true as const };
}

export async function POST(request: NextRequest) {
  const guard = await authorize(request);
  if (!guard.ok) return guard.response;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the divisions and try again." }, { status: 400 });
  }
  try {
    const divisions = await loadRemovalImpacts(parsed.data.seasonYear, parsed.data.divisions);
    return NextResponse.json({ divisions });
  } catch (error) {
    console.error("[division-ages] removal counts failed", error);
    return NextResponse.json({ error: "Could not check registrations for removed divisions." }, { status: 500 });
  }
}
