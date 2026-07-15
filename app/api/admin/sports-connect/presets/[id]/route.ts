import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import {
  deleteMappingPreset,
  getMappingPreset,
} from "@/lib/sportsConnect/mappingPresets";
import { isContentOrgId, resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json(
      { error: "Select a concrete site." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const data = await getMappingPreset(id?.trim() || "", targetOrg);
  if (!data) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }
  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(targetOrg)) {
    return NextResponse.json(
      { error: "Select a concrete site." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const ok = await deleteMappingPreset(id?.trim() || "", targetOrg);
  if (!ok) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }
  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
