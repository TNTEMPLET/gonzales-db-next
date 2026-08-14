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
 * Body: { organizationId: string, driveFolderId?: string, seasonYear?: number }
 * Triggers an immediate manual sync for an organization's Google Drive export folder.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      organizationId?: string;
      org?: string;
      driveFolderId?: string;
      seasonYear?: number;
    };

    const org = body.organizationId || body.org;
    if (!org || !isContentOrgId(org)) {
      return NextResponse.json(
        { error: "Valid content organizationId (fallball, gonzales, ascension) is required." },
        { status: 400 },
      );
    }

    if (body.driveFolderId && typeof body.driveFolderId === "string") {
      await setOrgDriveFolderMapping(org, body.driveFolderId);
    }

    const seasonYear =
      typeof body.seasonYear === "number" && Number.isFinite(body.seasonYear)
        ? body.seasonYear
        : getSeasonConfigForOrg(org).year;

    const result = await syncOrgDriveFolder({
      organizationId: org,
      seasonYear,
    });

    const recentRuns = await listImportRuns({ organizationId: org, seasonYear, limit: 10 });

    return NextResponse.json({
      ok: true,
      data: {
        syncResult: result,
        runs: recentRuns,
      },
    });
  } catch (err) {
    console.error("[api/admin/sports-connect/drive-sync] Sync failed:", err);
    if (isMissingDriveSyncSchemaError(err)) {
      return NextResponse.json(
        {
          error:
            "Drive sync database schema is not yet provisioned. Run the pending Prisma migration (prisma/migrations/20260814150000_sports_connect_drive_sync) before using this feature.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync execution failed" },
      { status: 500 },
    );
  }
}
