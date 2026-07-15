import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import {
  listMappingPresets,
  upsertMappingPreset,
} from "@/lib/sportsConnect/mappingPresets";
import {
  isSportsConnectReportKind,
  type SportsConnectReportKind,
} from "@/lib/sportsConnect/types";
import {
  isContentOrgId,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

function parseMappings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
    else if (v != null) out[k] = String(v);
  }
  return out;
}

export async function GET(request: NextRequest) {
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
      { error: "Select a concrete site to list mapping presets." },
      { status: 400 },
    );
  }

  const seasonParam = request.nextUrl.searchParams.get("seasonYear");
  const parsed = seasonParam ? Number(seasonParam) : Number.NaN;
  const seasonYear = Number.isFinite(parsed) ? parsed : undefined;
  const reportKindRaw = request.nextUrl.searchParams.get("reportKind");
  const reportKind = isSportsConnectReportKind(reportKindRaw)
    ? reportKindRaw
    : undefined;

  try {
    const data = await listMappingPresets({
      organizationId: targetOrg,
      seasonYear,
      reportKind,
    });
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list presets";
    console.error("[sports-connect/presets GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
      { error: "Select a concrete site before saving a mapping preset." },
      { status: 400 },
    );
  }

  let body: {
    seasonYear?: unknown;
    name?: unknown;
    reportKind?: unknown;
    divisionMapping?: unknown;
    teamMapping?: unknown;
    columnOverrides?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const seasonYear = Number(body.seasonYear);
  if (!Number.isFinite(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
    return NextResponse.json({ error: "seasonYear is required" }, { status: 400 });
  }

  const reportKind = String(body.reportKind || "PLAYER_REG");
  if (!isSportsConnectReportKind(reportKind)) {
    return NextResponse.json({ error: "Invalid reportKind" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "Default";
  const admin = await getAdminUserFromRequest(request);

  try {
    const data = await upsertMappingPreset({
      organizationId: targetOrg,
      seasonYear,
      name: name || "Default",
      reportKind: reportKind as SportsConnectReportKind,
      divisionMapping: parseMappings(body.divisionMapping),
      teamMapping: parseMappings(body.teamMapping),
      columnOverrides: body.columnOverrides
        ? parseMappings(body.columnOverrides)
        : null,
      createdByAdminId: admin?.id ?? null,
    });
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save preset";
    console.error("[sports-connect/presets POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
