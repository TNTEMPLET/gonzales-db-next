import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { isContentOrgId } from "@/lib/siteConfig";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import {
  getOrgDriveFolderMappings,
  syncOrgDriveFolder,
  type DriveScanResult,
} from "@/lib/sportsConnect/driveSync";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret =
    process.env.SPORTS_CONNECT_CRON_SECRET || process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${cronSecret}`;
  return safeCompare(authHeader, expected);
}

export async function GET(request: NextRequest) {
  // 1. Check feature flag kill switch
  if (process.env.ENABLE_SPORTSCONNECT_DRIVE_CRON === "false") {
    return NextResponse.json({
      ok: true,
      data: { status: "DISABLED_BY_FEATURE_FLAG" },
    });
  }

  // 2. Check timing-safe bearer authentication
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mappings = await getOrgDriveFolderMappings();
  if (mappings.length === 0) {
    return NextResponse.json({
      ok: true,
      data: {
        message: "No organization Drive folders configured in database.",
        scannedOrgs: 0,
      },
    });
  }

  const results: DriveScanResult[] = [];
  for (const mapping of mappings) {
    const orgId = mapping.organizationId;
    if (!isContentOrgId(orgId)) continue;

    const seasonYear = getSeasonConfigForOrg(orgId).year;

    try {
      const scanResult = await syncOrgDriveFolder({
        organizationId: orgId,
        seasonYear,
      });
      results.push(scanResult);
    } catch (err) {
      console.error(`[cron/sports-connect-drive-sync] Failed for org ${orgId}:`, err);
      results.push({
        organizationId: orgId,
        seasonYear,
        filesFound: 0,
        filesProcessed: 0,
        filesSkipped: 0,
        filesQuarantined: 1,
        errors: [err instanceof Error ? err.message : "Sync failed"],
      });
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      timestamp: new Date().toISOString(),
      scannedOrgs: results.length,
      results,
    },
  });
}
