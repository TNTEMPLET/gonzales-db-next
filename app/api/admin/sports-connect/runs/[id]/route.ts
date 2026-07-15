import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import {
  getImportRun,
  updateImportRun,
} from "@/lib/sportsConnect/importRuns";
import type { SportsConnectRunStatus } from "@/lib/sportsConnect/types";
import { isContentOrgId, resolveAdminTargetOrg } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

const RUN_STATUSES = new Set([
  "PREVIEW",
  "RUNNING",
  "DONE",
  "FAILED",
  "CANCELLED",
]);

function parseSummary(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

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
  const data = await getImportRun(id?.trim() || "", targetOrg);
  if (!data) {
    return NextResponse.json({ error: "Import run not found" }, { status: 404 });
  }
  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function PATCH(
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

  let body: {
    status?: unknown;
    summary?: unknown;
    errorMessage?: unknown;
    teamPlayerBatchId?: unknown;
    coachBatchId?: unknown;
    sourceFileName?: unknown;
    presetId?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let status: SportsConnectRunStatus | undefined;
  if (body.status !== undefined) {
    const statusRaw = String(body.status);
    if (!RUN_STATUSES.has(statusRaw)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    status = statusRaw as SportsConnectRunStatus;
  }

  const { id } = await context.params;
  const data = await updateImportRun({
    id: id?.trim() || "",
    organizationId: targetOrg,
    status,
    summary:
      body.summary === undefined ? undefined : parseSummary(body.summary),
    errorMessage:
      body.errorMessage === undefined
        ? undefined
        : typeof body.errorMessage === "string"
          ? body.errorMessage
          : null,
    teamPlayerBatchId:
      body.teamPlayerBatchId === undefined
        ? undefined
        : typeof body.teamPlayerBatchId === "string"
          ? body.teamPlayerBatchId
          : null,
    coachBatchId:
      body.coachBatchId === undefined
        ? undefined
        : typeof body.coachBatchId === "string"
          ? body.coachBatchId
          : null,
    sourceFileName:
      body.sourceFileName === undefined
        ? undefined
        : typeof body.sourceFileName === "string"
          ? body.sourceFileName
          : null,
    presetId:
      body.presetId === undefined
        ? undefined
        : typeof body.presetId === "string"
          ? body.presetId
          : null,
    markComplete:
      status === "DONE" || status === "FAILED" || status === "CANCELLED",
  });

  if (!data) {
    return NextResponse.json({ error: "Import run not found" }, { status: 404 });
  }
  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
