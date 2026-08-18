import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { downloadDriveFileBuffer } from "@/lib/sportsConnect/driveSync";
import { isContentOrgId, resolveAdminTargetOrg } from "@/lib/siteConfig";

function contentTypeForFileName(name: string | null): string {
  const lower = (name ?? "").toLowerCase();
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
}

/**
 * Streams the raw bytes of an already-synced Drive file back to the browser
 * so a "Use Synced Drive File" button can hand the exact same File object to
 * the existing local-upload import pipeline (preview/mapping/import), no
 * server-side import logic duplicated.
 *
 * Keyed by SportsConnectImportRun id, not a raw driveFileId — the run row
 * carries organizationId, so this can verify the file actually belongs to
 * the caller's own org before ever calling out to Drive. A raw driveFileId
 * would let any admin fetch any org's file by guessing/observing an id.
 */
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
      { error: "Select a concrete site to download a synced Drive file." },
      { status: 400 },
    );
  }

  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const run = await prisma.sportsConnectImportRun.findFirst({
    where: { id: runId, organizationId: targetOrg },
    select: { driveFileId: true, sourceFileName: true },
  });
  if (!run || !run.driveFileId) {
    return NextResponse.json(
      { error: "No synced Drive file found for this import run" },
      { status: 404 },
    );
  }

  const buffer = await downloadDriveFileBuffer(run.driveFileId);
  if (!buffer) {
    return NextResponse.json(
      { error: "Failed to download the file from Google Drive" },
      { status: 502 },
    );
  }

  const fileName = (run.sourceFileName || "synced-file").replace(/[^a-zA-Z0-9._-]+/g, "_");

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentTypeForFileName(run.sourceFileName),
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
