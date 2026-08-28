import "server-only";

import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

import { recordImportRunSafe } from "./importRuns";
import {
  isAllowedSportsConnectExportName,
  parseSportsConnectExportBuffer,
  SPORTS_CONNECT_INGEST_MAX_BYTES,
  type ParsedSportsConnectExport,
} from "./parseExportBuffer";
import {
  previewSportsConnectFile,
  type SportsConnectFilePreviewResult,
} from "./preview";
import type { SportsConnectImportRunView } from "./types";

export type SportsConnectIngestResult = {
  organizationId: ContentOrgId;
  seasonYear: number;
  fileName: string;
  totalRowCount: number;
  headers: string[];
  preview: SportsConnectFilePreviewResult;
  run: SportsConnectImportRunView | null;
  deskPath: string;
  deskUrl: string | null;
  message: string;
};

function adminBaseUrl(): string | null {
  const fromEnv =
    process.env.SPORTS_CONNECT_ADMIN_BASE_URL?.trim() ||
    process.env.ADMIN_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_ADMIN_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // Default Master Admin production host when SITE_ORG is master or unset for ingest.
  return "https://admin.apbaseball.com";
}

export function buildSportsConnectDeskUrl(
  organizationId: ContentOrgId,
  seasonYear?: number,
): { deskPath: string; deskUrl: string | null } {
  const qs = new URLSearchParams({ org: organizationId });
  if (seasonYear && Number.isFinite(seasonYear)) {
    qs.set("seasonYear", String(seasonYear));
  }
  const deskPath = `/admin/sports-connect?${qs.toString()}`;
  const base = adminBaseUrl();
  return {
    deskPath,
    deskUrl: base ? `${base}${deskPath}` : null,
  };
}

export async function ingestSportsConnectExport(input: {
  organizationId: string;
  seasonYear?: number;
  fileName: string;
  buffer: ArrayBuffer | Buffer | Uint8Array;
  recordPreviewRun?: boolean;
}): Promise<
  | { ok: true; data: SportsConnectIngestResult }
  | { ok: false; status: number; error: string }
> {
  if (!isContentOrgId(input.organizationId)) {
    return {
      ok: false,
      status: 400,
      error: "org must be a concrete content site (fallball, gonzales, or ascension).",
    };
  }
  const organizationId = input.organizationId;

  if (!isAllowedSportsConnectExportName(input.fileName)) {
    return {
      ok: false,
      status: 400,
      error: "file must be .csv, .xlsx, or .xls",
    };
  }

  const byteLength =
    input.buffer instanceof ArrayBuffer
      ? input.buffer.byteLength
      : input.buffer.byteLength;
  if (byteLength <= 0) {
    return { ok: false, status: 400, error: "empty file" };
  }
  if (byteLength > SPORTS_CONNECT_INGEST_MAX_BYTES) {
    return {
      ok: false,
      status: 400,
      error: `file exceeds ${SPORTS_CONNECT_INGEST_MAX_BYTES} bytes`,
    };
  }

  const seasonYear = Number.isFinite(input.seasonYear)
    ? Number(input.seasonYear)
    : getSeasonConfigForOrg(organizationId).year;
  if (seasonYear < 2000 || seasonYear > 2100) {
    return { ok: false, status: 400, error: "invalid seasonYear" };
  }

  let parsed: ParsedSportsConnectExport;
  try {
    parsed = parseSportsConnectExportBuffer({
      buffer: input.buffer,
      fileName: input.fileName,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to parse export file";
    return { ok: false, status: 422, error: message };
  }

  if (parsed.headers.length === 0) {
    return {
      ok: false,
      status: 422,
      error: "Could not read column headers from file",
    };
  }

  const preview = previewSportsConnectFile({
    fileName: parsed.fileName,
    headers: parsed.headers,
    rows: parsed.rows,
  });

  let run: SportsConnectImportRunView | null = null;
  if (input.recordPreviewRun !== false && preview.detection.reportKind) {
    run = await recordImportRunSafe({
      organizationId,
      seasonYear,
      reportKind: preview.detection.reportKind,
      status: "PREVIEW",
      sourceFileName: parsed.fileName,
      summary: {
        source: "n8n_ingest",
        confidence: preview.detection.confidence,
        rowCount: parsed.totalRowCount,
        sampleRowCount: preview.rowCount,
        missingGuardianEmailEstimate: preview.missingGuardianEmailEstimate,
        message: preview.detection.message,
        matchedHeaders: preview.detection.matchedHeaders.slice(0, 20),
      },
    });
  }

  const { deskPath, deskUrl } = buildSportsConnectDeskUrl(
    organizationId,
    seasonYear,
  );

  const kindLabel = preview.detection.reportKind
    ? preview.detection.reportKind.replaceAll("_", " ")
    : "unknown report";
  const missing =
    preview.missingGuardianEmailEstimate != null
      ? ` Estimated missing guardian emails (sample): ${preview.missingGuardianEmailEstimate}.`
      : "";

  return {
    ok: true,
    data: {
      organizationId,
      seasonYear,
      fileName: parsed.fileName,
      totalRowCount: parsed.totalRowCount,
      headers: parsed.headers,
      preview,
      run,
      deskPath,
      deskUrl,
      message: `Ingested ${parsed.fileName} as ${kindLabel} (${Math.round(preview.detection.confidence * 100)}% confidence).${missing} Open Ops Desk to import — no roster write was performed.`,
    },
  };
}
