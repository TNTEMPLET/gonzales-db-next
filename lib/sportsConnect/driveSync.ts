import "server-only";

import prisma from "@/lib/prisma";
import {
  driveV3Request,
  getDriveAccessToken,
} from "@/lib/google/driveServiceAccount";
import { fileIsUnderOrgFolder } from "@/lib/google/driveOrgFolder";
import { detectSportsConnectReport } from "./columnProfiles";
import {
  isAllowedSportsConnectExportName,
  parseSportsConnectExportBuffer,
  SPORTS_CONNECT_INGEST_MAX_BYTES,
  SPORTS_CONNECT_INGEST_MAX_ROWS,
} from "./parseExportBuffer";
import { previewSportsConnectFile } from "./preview";
import { createImportRun, updateImportRun } from "./importRuns";
import type { SportsConnectReportKind, SportsConnectRunStatus } from "./types";

const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minute lock timeout

export type DriveFileItem = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum?: string;
  size?: string;
};

export type DriveScanResult = {
  organizationId: string;
  seasonYear: number;
  filesFound: number;
  filesProcessed: number;
  filesSkipped: number;
  filesQuarantined: number;
  errors: string[];
};

/**
 * Fetch all organization-to-Drive folder mappings from DB.
 */
export async function getOrgDriveFolderMappings(): Promise<
  Array<{ organizationId: string; driveFolderId: string }>
> {
  try {
    const mappings = await prisma.sportsConnectOrgDriveFolder.findMany({
      select: {
        organizationId: true,
        driveFolderId: true,
      },
    });
    return mappings;
  } catch (err) {
    console.error("[driveSync] Failed to fetch folder mappings:", err);
    return [];
  }
}

/**
 * Get folder mapping for a single organization.
 */
export async function getOrgDriveFolderMapping(
  organizationId: string,
): Promise<string | null> {
  try {
    const row = await prisma.sportsConnectOrgDriveFolder.findUnique({
      where: { organizationId },
      select: { driveFolderId: true },
    });
    return row?.driveFolderId ?? null;
  } catch {
    return null;
  }
}

/**
 * Upsert or update an organization's Google Drive folder ID mapping.
 */
export async function setOrgDriveFolderMapping(
  organizationId: string,
  driveFolderId: string,
): Promise<{ organizationId: string; driveFolderId: string }> {
  const row = await prisma.sportsConnectOrgDriveFolder.upsert({
    where: { organizationId },
    create: { organizationId, driveFolderId: driveFolderId.trim() },
    update: { driveFolderId: driveFolderId.trim() },
  });
  return { organizationId: row.organizationId, driveFolderId: row.driveFolderId };
}

/**
 * List files in a specific Google Drive folder ID.
 */
export async function listFolderFiles(
  folderId: string,
): Promise<DriveFileItem[]> {
  const query = `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
  const pathAndQuery = `/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime,md5Checksum,size)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  const res = await driveV3Request<{ files?: DriveFileItem[] }>(pathAndQuery);
  if (!res.ok) {
    console.error("[driveSync] Failed to list folder files:", res.message);
    return [];
  }
  return res.data.files ?? [];
}

/**
 * Atomic lease lock acquisition for a specific Google Drive file revision.
 */
export async function acquireDriveRunLease(input: {
  organizationId: string;
  seasonYear: number;
  driveFileId: string;
  revisionToken: string;
  sourceFileName: string;
}): Promise<
  | { acquired: true; runId: string }
  | { acquired: false; reason: "ALREADY_PROCESSED" | "LEASE_ACTIVE" | "ERROR" }
> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

  try {
    // 1. Check if a completed or quarantined run already exists for this exact revision
    const existingRun = await prisma.sportsConnectImportRun.findFirst({
      where: {
        organizationId: input.organizationId,
        seasonYear: input.seasonYear,
        driveFileId: input.driveFileId,
        revisionToken: input.revisionToken,
      },
    });

    if (existingRun) {
      if (
        existingRun.status === "DONE" ||
        existingRun.status === "QUARANTINED"
      ) {
        return { acquired: false, reason: "ALREADY_PROCESSED" };
      }

      if (
        existingRun.status === "LEASED" &&
        existingRun.leaseExpiresAt &&
        existingRun.leaseExpiresAt > now
      ) {
        return { acquired: false, reason: "LEASE_ACTIVE" };
      }

      // Expired lease or failed run - atomically re-acquire lock
      const updated = await prisma.sportsConnectImportRun.updateMany({
        where: {
          id: existingRun.id,
          OR: [
            { status: "LEASED", leaseExpiresAt: { lt: now } },
            { status: "FAILED" },
          ],
        },
        data: {
          status: "LEASED",
          leaseExpiresAt,
          errorMessage: null,
        },
      });

      if (updated.count === 0) {
        return { acquired: false, reason: "LEASE_ACTIVE" };
      }

      return { acquired: true, runId: existingRun.id };
    }

    // 2. Create new lease entry
    const newRun = await createImportRun({
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
      reportKind: "PLAYER_REG", // Temporary default until detected
      status: "LEASED",
      sourceFileName: input.sourceFileName,
      driveFileId: input.driveFileId,
      revisionToken: input.revisionToken,
      leaseExpiresAt,
    });

    return { acquired: true, runId: newRun.id };
  } catch (err) {
    console.error("[driveSync] Lease acquisition failed:", err);
    return { acquired: false, reason: "ERROR" };
  }
}

/**
 * Download file buffer directly from Google Drive v3 API.
 */
export async function downloadDriveFileBuffer(
  fileId: string,
): Promise<Buffer | null> {
  const token = await getDriveAccessToken();
  if (!token) return null;

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error(
      `[driveSync] Download failed for file ${fileId}: ${res.statusText}`,
    );
    return null;
  }

  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Main Google Drive auto-sync engine for an organization and season year.
 */
export async function syncOrgDriveFolder(input: {
  organizationId: string;
  seasonYear: number;
}): Promise<DriveScanResult> {
  const result: DriveScanResult = {
    organizationId: input.organizationId,
    seasonYear: input.seasonYear,
    filesFound: 0,
    filesProcessed: 0,
    filesSkipped: 0,
    filesQuarantined: 0,
    errors: [],
  };

  const folderId = await getOrgDriveFolderMapping(input.organizationId);
  if (!folderId) {
    result.errors.push(
      `No Google Drive folder mapped for organization '${input.organizationId}'`,
    );
    return result;
  }

  const files = await listFolderFiles(folderId);
  result.filesFound = files.length;

  for (const file of files) {
    if (!isAllowedSportsConnectExportName(file.name)) {
      result.filesSkipped++;
      continue;
    }

    // Verify tenant boundary using driveOrgFolder.ts helper
    const safeUnderOrg = await fileIsUnderOrgFolder(file.id, folderId);
    if (!safeUnderOrg) {
      console.warn(
        `[driveSync] Security Boundary Check Failed for file ${file.id} under org folder ${folderId}`,
      );
      result.errors.push(`File '${file.name}' is outside tenant folder boundary.`);
      result.filesSkipped++;
      continue;
    }

    const revisionToken = file.md5Checksum || file.modifiedTime;
    const lease = await acquireDriveRunLease({
      organizationId: input.organizationId,
      seasonYear: input.seasonYear,
      driveFileId: file.id,
      revisionToken,
      sourceFileName: file.name,
    });

    if (!lease.acquired) {
      result.filesSkipped++;
      continue;
    }

    // Early size check before downloading
    if (file.size && Number(file.size) > SPORTS_CONNECT_INGEST_MAX_BYTES) {
      await updateImportRun({
        id: lease.runId,
        organizationId: input.organizationId,
        status: "QUARANTINED",
        errorMessage: `File size (${Math.round(Number(file.size) / 1024 / 1024)}MB) exceeds maximum limit of ${SPORTS_CONNECT_INGEST_MAX_BYTES / 1024 / 1024}MB.`,
        markComplete: true,
      });
      result.filesQuarantined++;
      continue;
    }

    // Download file buffer
    const buffer = await downloadDriveFileBuffer(file.id);
    if (!buffer) {
      await updateImportRun({
        id: lease.runId,
        organizationId: input.organizationId,
        status: "FAILED",
        errorMessage: "Failed to download file from Google Drive",
        markComplete: true,
      });
      result.errors.push(`Failed to download '${file.name}'`);
      result.filesQuarantined++;
      continue;
    }

    try {
      const parsed = parseSportsConnectExportBuffer({
        buffer,
        fileName: file.name,
      });

      if (parsed.exceedsMaxRows) {
        await updateImportRun({
          id: lease.runId,
          organizationId: input.organizationId,
          status: "QUARANTINED",
          errorMessage: `Export row count (${parsed.totalRowCount}) exceeds maximum limit of ${SPORTS_CONNECT_INGEST_MAX_ROWS} rows.`,
          markComplete: true,
        });
        result.filesQuarantined++;
        continue;
      }

      if (parsed.headers.length === 0) {
        await updateImportRun({
          id: lease.runId,
          organizationId: input.organizationId,
          status: "QUARANTINED",
          errorMessage: "Could not detect column headers from export file.",
          markComplete: true,
        });
        result.filesQuarantined++;
        continue;
      }

      const preview = previewSportsConnectFile({
        fileName: parsed.fileName,
        headers: parsed.headers,
        rows: parsed.rows,
      });

      const reportKind = preview.detection.reportKind;
      if (!reportKind) {
        await updateImportRun({
          id: lease.runId,
          organizationId: input.organizationId,
          status: "QUARANTINED",
          errorMessage: "Unrecognized SportsConnect export report type.",
          markComplete: true,
        });
        result.filesQuarantined++;
        continue;
      }

      // Record successful dry-run / preview detection with real detected reportKind
      await updateImportRun({
        id: lease.runId,
        organizationId: input.organizationId,
        reportKind,
        status: "DONE",
        summary: {
          source: "google_drive_sync",
          confidence: preview.detection.confidence,
          rowCount: parsed.totalRowCount,
          sampleRowCount: preview.rowCount,
          missingGuardianEmailEstimate: preview.missingGuardianEmailEstimate,
          message: preview.detection.message,
          matchedHeaders: preview.detection.matchedHeaders.slice(0, 20),
        },
        markComplete: true,
      });

      result.filesProcessed++;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal processing error";
      await updateImportRun({
        id: lease.runId,
        organizationId: input.organizationId,
        status: "FAILED",
        errorMessage: message,
        markComplete: true,
      });
      result.errors.push(`Processing failed for '${file.name}': ${message}`);
      result.filesQuarantined++;
    }
  }

  return result;
}
