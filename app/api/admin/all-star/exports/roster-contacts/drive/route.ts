import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import {
  buildRosterContactRows,
  rosterContactRowsToCsv,
} from "@/lib/allStar/rosterContactExport";
import {
  resolveOrgDriveFolderPath,
  uploadFileToDriveFolder,
} from "@/lib/google/driveOrgFolder";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { getOrgDocumentsConfig } from "@/lib/orgDocuments";
import { CONTENT_ORGS, isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

const DEFAULT_DRIVE_FOLDER_PATH = ["2026", "2026 All Star Roster Docs"];

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as {
    cycleId?: string;
    organizationId?: string;
    seasonYear?: number;
    fileName?: string;
  };

  const cycleId = body.cycleId?.trim() || undefined;
  const orgParam = body.organizationId?.trim() || undefined;
  const seasonYear =
    typeof body.seasonYear === "number" && Number.isFinite(body.seasonYear)
      ? body.seasonYear
      : undefined;

  if (!cycleId && !orgParam) {
    return NextResponse.json(
      { error: "cycleId or organizationId is required" },
      { status: 400 },
    );
  }

  const adminUser = await getAdminUserFromRequest(request);
  let organizationId: ContentOrgId | undefined;

  if (cycleId) {
    const cycle = await prisma.allStarBallotCycle.findUnique({
      where: { id: cycleId },
      select: { organizationId: true },
    });
    if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
    if (!adminUser?.isMaster && cycle.organizationId !== resolveAuthOrganizationId(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    if (!orgParam || !isContentOrgId(orgParam)) {
      return NextResponse.json(
        { error: `organizationId must be one of: ${CONTENT_ORGS.join(", ")}` },
        { status: 400 },
      );
    }
    organizationId = orgParam;
    if (!adminUser?.isMaster && organizationId !== resolveAuthOrganizationId(request)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const driveConfig = getOrgDocumentsConfig();
  if (!driveConfig) {
    return NextResponse.json({ error: "AP_GOOGLE_DRIVE_FOLDER_URL is not set." }, { status: 503 });
  }

  const rows = await buildRosterContactRows(prisma, {
    cycleId,
    organizationId,
    seasonYear,
  });
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No finalized All-Star roster players found for this export." },
      { status: 404 },
    );
  }

  const folderPath =
    seasonYear && seasonYear !== 2026
      ? [String(seasonYear), `${seasonYear} All Star Roster Docs`]
      : DEFAULT_DRIVE_FOLDER_PATH;
  const folderResult = await resolveOrgDriveFolderPath(driveConfig.folderId, folderPath);
  if (!folderResult.ok) {
    return NextResponse.json({ error: folderResult.message }, { status: folderResult.status });
  }

  const csv = rosterContactRowsToCsv(rows);
  const defaultFileName = body.fileName?.trim()
    || (organizationId
      ? `all-star-roster-contacts-${organizationId}${seasonYear ? `-${seasonYear}` : ""}.csv`
      : "all-star-roster-contacts-all-orgs-2026.csv");

  const upload = await uploadFileToDriveFolder({
    folderId: folderResult.data,
    fileName: defaultFileName,
    mimeType: "text/csv",
    content: Buffer.from(csv, "utf8"),
  });
  if (!upload.ok) {
    return NextResponse.json({ error: upload.message }, { status: upload.status });
  }

  return NextResponse.json({
    success: true,
    fileName: defaultFileName,
    folderId: folderResult.data,
    folderPath: folderPath.join(" / "),
    webViewLink: upload.data.webViewLink ?? null,
    fileId: upload.data.id,
    rowCount: rows.length,
    matchedEmailCount: rows.filter((row) => row.emailMatchStatus === "matched").length,
  });
}
