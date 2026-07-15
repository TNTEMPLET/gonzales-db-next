import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import {
  createImportRun,
  listImportRuns,
} from "@/lib/sportsConnect/importRuns";
import {
  isSportsConnectReportKind,
  type SportsConnectReportKind,
  type SportsConnectRunStatus,
} from "@/lib/sportsConnect/types";
import {
  isContentOrgId,
  resolveAdminTargetOrg,
} from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

const RUN_STATUSES = new Set([
  "PREVIEW",
  "RUNNING",
  "DONE",
  "FAILED",
  "CANCELLED",
]);

function parseSummary(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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
      { error: "Select a concrete site to list SportsConnect import runs." },
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
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : 25;

  try {
    const data = await listImportRuns({
      organizationId: targetOrg,
      seasonYear,
      reportKind,
      limit: Number.isFinite(limit) ? limit : 25,
    });
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list import runs";
    console.error("[sports-connect/runs GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Create an audit run (PREVIEW/RUNNING) or record a completed assisted import. */
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
      { error: "Select a concrete site before recording an import run." },
      { status: 400 },
    );
  }

  let body: {
    seasonYear?: unknown;
    reportKind?: unknown;
    status?: unknown;
    sourceFileName?: unknown;
    presetId?: unknown;
    summary?: unknown;
    errorMessage?: unknown;
    teamPlayerBatchId?: unknown;
    coachBatchId?: unknown;
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

  const statusRaw = String(body.status || "PREVIEW");
  if (!RUN_STATUSES.has(statusRaw)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const admin = await getAdminUserFromRequest(request);

  try {
    const data = await createImportRun({
      organizationId: targetOrg,
      seasonYear,
      reportKind: reportKind as SportsConnectReportKind,
      status: statusRaw as SportsConnectRunStatus,
      sourceFileName:
        typeof body.sourceFileName === "string" ? body.sourceFileName : null,
      presetId: typeof body.presetId === "string" ? body.presetId : null,
      summary: parseSummary(body.summary),
      errorMessage:
        typeof body.errorMessage === "string" ? body.errorMessage : null,
      teamPlayerBatchId:
        typeof body.teamPlayerBatchId === "string"
          ? body.teamPlayerBatchId
          : null,
      coachBatchId:
        typeof body.coachBatchId === "string" ? body.coachBatchId : null,
      createdByAdminId: admin?.id ?? null,
    });
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create import run";
    console.error("[sports-connect/runs POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
