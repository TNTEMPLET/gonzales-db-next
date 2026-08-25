import { NextRequest, NextResponse } from "next/server";

import { parseSeasonYear } from "@/lib/allStar/server";
import { ensureAdminModule } from "@/lib/news/auth";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { getOrgDriveFolderMapping } from "@/lib/sportsConnect/driveSync";
import {
  isMissingDriveSyncSchemaError,
  listImportRuns,
} from "@/lib/sportsConnect/importRuns";
import { getReportCatalogEntry, recommendedLoadOrder } from "@/lib/sportsConnect/reportCatalog";
import type { SportsConnectImportRunView, SportsConnectReportKind } from "@/lib/sportsConnect/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DecoratedRun = SportsConnectImportRunView & {
  reportTitle: string;
  reportSummary: string;
};

function decorate(run: SportsConnectImportRunView): DecoratedRun {
  const entry = getReportCatalogEntry(run.reportKind);
  return {
    ...run,
    reportTitle: entry?.title ?? run.reportKind,
    reportSummary: entry?.summary ?? "",
  };
}

/**
 * GET /api/admin/teams/smart-build/inspector?org=fallball
 *
 * Stage 1 of the Smart Auto-Build wizard: Drive connection status + the most
 * recent detected/synced files per report kind, decorated with the human
 * catalog copy (title/summary) so the wizard doesn't show raw report-kind
 * enum strings to a non-technical admin. Folds in the read-only half of
 * AdminSportsConnectDesk's "Google Drive Sync" panel directly into Teams
 * Management instead of leaving it on a separate page.
 */
export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const seasonYear =
    parseSeasonYear(String(request.nextUrl.searchParams.get("seasonYear") || "")) ||
    getSeasonConfigForOrg(targetOrg).year;

  try {
    const driveFolderId = await getOrgDriveFolderMapping(targetOrg);
    const runs = await listImportRuns({ organizationId: targetOrg, seasonYear, limit: 30 });
    const decorated = runs.map(decorate);

    const runsByKind: Record<SportsConnectReportKind, DecoratedRun[]> = {
      TEAM_LIST: [],
      PLAYER_REG: [],
      COACH_VOLUNTEER: [],
    };
    for (const run of decorated) {
      runsByKind[run.reportKind].push(run);
    }

    const latestByKind: Record<SportsConnectReportKind, DecoratedRun | null> = {
      TEAM_LIST: runsByKind.TEAM_LIST.find((r) => r.status === "DONE") ?? null,
      PLAYER_REG: runsByKind.PLAYER_REG.find((r) => r.status === "DONE") ?? null,
      COACH_VOLUNTEER: runsByKind.COACH_VOLUNTEER.find((r) => r.status === "DONE") ?? null,
    };

    return NextResponse.json({
      data: {
        organizationId: targetOrg,
        seasonYear,
        driveConfigured: !!driveFolderId,
        driveFolderId,
        catalog: recommendedLoadOrder(),
        runsByKind,
        latestByKind,
      },
    });
  } catch (err) {
    console.error("[api/admin/teams/smart-build/inspector GET]", err);
    const schemaMissing = isMissingDriveSyncSchemaError(err);
    return NextResponse.json({
      data: {
        organizationId: targetOrg,
        seasonYear,
        driveConfigured: false,
        driveFolderId: null,
        catalog: recommendedLoadOrder(),
        runsByKind: { TEAM_LIST: [], PLAYER_REG: [], COACH_VOLUNTEER: [] },
        latestByKind: { TEAM_LIST: null, PLAYER_REG: null, COACH_VOLUNTEER: null },
        degraded: true,
        degradedReason: schemaMissing
          ? "Drive sync database schema is not yet provisioned. Run the pending Prisma migration."
          : "Drive sync status is temporarily unavailable.",
      },
    });
  }
}
