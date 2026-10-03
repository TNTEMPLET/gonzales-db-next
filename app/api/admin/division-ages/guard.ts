import { NextRequest, NextResponse } from "next/server";

import { gateDivisionAges } from "@/lib/ageDivisions/access";
import { hasAdminRoleAtLeast, type AdminRole } from "@/lib/auth/adminRoles";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";

export async function guardDivisionAges(
  request: NextRequest,
  write: boolean,
): Promise<
  | { ok: true; org: ContentOrgId; adminId: string; canEdit: boolean }
  | { ok: false; response: NextResponse }
> {
  const auth = await ensureAdminModule(request, "DIVISION_AGES");
  const gated = gateDivisionAges(
    auth.ok ? { ok: true, role: auth.role } : { ok: false, status: auth.status, message: auth.message },
    write,
  );
  if (!gated.ok || !auth.ok) {
    const status = gated.ok ? 401 : gated.status;
    const message = gated.ok ? "Unauthorized" : gated.message;
    return { ok: false, response: NextResponse.json({ error: message }, { status }) };
  }
  const org = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const role: AdminRole = auth.role;
  return { ok: true, org, adminId: auth.admin.id, canEdit: hasAdminRoleAtLeast(role, "ADMIN") };
}

export function readSeasonYear(request: NextRequest): number | null {
  const raw = request.nextUrl.searchParams.get("seasonYear");
  if (!raw || !/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  if (year < 1990 || year > 2200) return null;
  return year;
}
