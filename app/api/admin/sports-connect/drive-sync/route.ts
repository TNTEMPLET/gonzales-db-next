import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import { isContentOrgId } from "@/lib/siteConfig";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import {
  setOrgDriveFolderMapping,
  getOrgDriveFolderMapping,
  syncOrgDriveFolder,
} from "@/lib/sportsConnect/driveSync";
import {
  listImportRuns,
  isMissingDriveSyncSchemaError,
} from "@/lib/sportsConnect/importRuns";
import { ensureDriveSyncSchema } from "@/lib/sportsConnect/driveSyncSchema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/sports-connect/drive-sync?org=gonzales
 * Retrieves Google Drive folder mapping status and recent sync runs for an organization.
 */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org") || searchParams.get("organizationId");
  if (!org || !isContentOrgId(org)) {
    return NextResponse.json(
      { error: "Invalid content org parameter" },
      { status: 400 },
    );
  }

  const seasonYear = getSeasonConfigForOrg(org).year;

  try {
    // getOrgDriveFolderMapping already degrades to null on a missing-table error;
    // listImportRuns already degrades to [] — this try/catch is defense-in-depth
    // for any other unexpected failure in either call.
    const driveFolderId = await getOrgDriveFolderMapping(org);
    const runs = await listImportRuns({ organizationId: org, seasonYear, limit: 15 });

    return NextResponse.json({
      ok: true,
      data: {
        organizationId: org,
        seasonYear,
        configured: !!driveFolderId,
        driveFolderId,
        runs,
      },
    });
  } catch (err) {
    console.error("[api/admin/sports-connect/drive-sync GET]", err);
    const schemaMissing = isMissingDriveSyncSchemaError(err);
    return NextResponse.json({
      ok: true,
      data: {
        organizationId: org,
        seasonYear,
        configured: false,
        driveFolderId: null,
        runs: [],
        degraded: true,
        degradedReason: schemaMissing
          ? "Drive sync database schema is not yet provisioned. Run the pending Prisma migration."
          : "Drive sync status is temporarily unavailable.",
      },
    });
  }
}

/**
 * POST /api/admin/sports-connect/drive-sync
 * Body: { organizationId: string, driveFolderId?: string, seasonYear?: number, provisionOnly?: boolean }
 *
 * Default: triggers an immediate manual sync for an organization's Google Drive
 * export folder. If the Drive-sync schema isn't provisioned yet, this makes one
 * automatic attempt to provision it (see lib/sportsConnect/driveSyncSchema.ts)
 * and retries the sync exactly once — it does not loop.
 *
 * `provisionOnly: true` (the admin desk's "Run DB Migration" button): just runs
 * the schema-provisioning step and returns, without requiring a folder ID or
 * attempting a sync. Useful when the desk is in a degraded state and doesn't
 * know the org's folder ID yet.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    organizationId?: string;
    org?: string;
    driveFolderId?: string;
    seasonYear?: number;
    provisionOnly?: boolean;
  };

  if (body.provisionOnly === true) {
    const provisionResult = await ensureDriveSyncSchema();
    if (!provisionResult.ok) {
      return NextResponse.json(
        {
          error: `Schema provisioning failed: ${provisionResult.error}. Run 'npx prisma migrate deploy' manually instead.`,
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, data: { provisioned: true } });
  }

  const org = body.organizationId || body.org;
  if (!org || !isContentOrgId(org)) {
    return NextResponse.json(
      { error: "Valid content organizationId (fallball, gonzales, ascension) is required." },
      { status: 400 },
    );
  }

  const seasonYear =
    typeof body.seasonYear === "number" && Number.isFinite(body.seasonYear)
      ? body.seasonYear
      : getSeasonConfigForOrg(org).year;

  async function runSync() {
    if (body.driveFolderId && typeof body.driveFolderId === "string") {
      await setOrgDriveFolderMapping(org as string, body.driveFolderId);
    }
    const syncResult = await syncOrgDriveFolder({
      organizationId: org as string,
      seasonYear,
    });
    const recentRuns = await listImportRuns({ organizationId: org as string, seasonYear, limit: 10 });
    return { syncResult, runs: recentRuns };
  }

  try {
    const data = await runSync();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    if (!isMissingDriveSyncSchemaError(err)) {
      console.error("[api/admin/sports-connect/drive-sync] Sync failed:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Sync execution failed" },
        { status: 500 },
      );
    }

    // Schema missing — attempt to provision it once, then retry the sync once.
    // Not a loop: if either step fails a second time, we surface a clear error.
    console.warn(
      "[api/admin/sports-connect/drive-sync] Schema missing, attempting one-time auto-provision + retry",
    );
    const provisionResult = await ensureDriveSyncSchema();
    if (!provisionResult.ok) {
      return NextResponse.json(
        {
          error: `Drive sync schema is not provisioned and auto-provisioning failed: ${provisionResult.error}. Run 'npx prisma migrate deploy' manually.`,
        },
        { status: 503 },
      );
    }

    try {
      const data = await runSync();
      return NextResponse.json({ ok: true, data: { ...data, autoProvisioned: true } });
    } catch (retryErr) {
      console.error(
        "[api/admin/sports-connect/drive-sync] Sync still failing after auto-provision:",
        retryErr,
      );
      return NextResponse.json(
        {
          error:
            retryErr instanceof Error
              ? retryErr.message
              : "Sync failed even after auto-provisioning the schema.",
        },
        { status: 500 },
      );
    }
  }
}
