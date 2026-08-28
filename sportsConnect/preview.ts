/**
 * Client-safe multi-file SportsConnect preview helpers (no DB).
 */
import {
  detectSportsConnectReport,
  headersFromRow,
} from "./columnProfiles";
import { estimateMissingGuardianEmailFromRows } from "./guardianEstimate";
import { recommendedLoadOrder } from "./reportCatalog";
import type {
  ColumnDetectResult,
  SportsConnectReportKind,
} from "./types";

export type SportsConnectFilePreviewInput = {
  fileName: string;
  headers?: string[];
  /** First data row keys or sample rows for guardian-email estimates. */
  rows?: Array<Record<string, unknown>>;
};

export type SportsConnectFilePreviewResult = {
  fileName: string;
  headers: string[];
  detection: ColumnDetectResult;
  rowCount: number;
  missingGuardianEmailEstimate: number | null;
  suggestedStep: {
    reportKind: SportsConnectReportKind | null;
    adminPath: string;
    adminLabel: string;
    sortOrder: number;
  };
};

export type SportsConnectMultiPreviewSummary = {
  files: SportsConnectFilePreviewResult[];
  loadOrder: Array<{
    kind: SportsConnectReportKind;
    title: string;
    adminPath: string;
    adminLabel: string;
    assignedFiles: string[];
  }>;
  unassignedFiles: string[];
  message: string;
};

function resolveHeaders(input: SportsConnectFilePreviewInput): string[] {
  if (Array.isArray(input.headers) && input.headers.length > 0) {
    return input.headers.map((h) => String(h ?? "").trim()).filter(Boolean);
  }
  if (input.rows?.[0]) {
    return headersFromRow(input.rows[0]);
  }
  return [];
}

export function previewSportsConnectFile(
  input: SportsConnectFilePreviewInput,
): SportsConnectFilePreviewResult {
  const headers = resolveHeaders(input);
  const detection = detectSportsConnectReport(headers);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const catalog = recommendedLoadOrder();
  const match = detection.reportKind
    ? catalog.find((e) => e.kind === detection.reportKind)
    : null;

  let missingGuardianEmailEstimate: number | null = null;
  if (rows.length > 0 && detection.reportKind === "PLAYER_REG") {
    missingGuardianEmailEstimate =
      estimateMissingGuardianEmailFromRows(rows).missingGuardianEmail;
  }

  return {
    fileName: input.fileName || "upload",
    headers,
    detection,
    rowCount: rows.length,
    missingGuardianEmailEstimate,
    suggestedStep: {
      reportKind: detection.reportKind,
      adminPath: match?.adminPath ?? "/admin/teams",
      adminLabel: match?.adminLabel ?? "Teams",
      sortOrder: match?.sortOrder ?? 999,
    },
  };
}

export function previewSportsConnectFiles(
  files: SportsConnectFilePreviewInput[],
): SportsConnectMultiPreviewSummary {
  const results = files.map(previewSportsConnectFile);
  const loadOrder = recommendedLoadOrder().map((entry) => ({
    kind: entry.kind,
    title: entry.title,
    adminPath: entry.adminPath,
    adminLabel: entry.adminLabel,
    assignedFiles: results
      .filter((f) => f.detection.reportKind === entry.kind)
      .map((f) => f.fileName),
  }));

  const unassignedFiles = results
    .filter((f) => !f.detection.reportKind)
    .map((f) => f.fileName);

  const assignedKinds = new Set(
    results
      .map((f) => f.detection.reportKind)
      .filter((k): k is SportsConnectReportKind => !!k),
  );

  let message: string;
  if (results.length === 0) {
    message = "Upload one or more SportsConnect exports to build a load plan.";
  } else if (unassignedFiles.length === results.length) {
    message =
      "Could not match any file to a known SportsConnect export. Check headers against the report catalog.";
  } else {
    const kinds = [...assignedKinds]
      .map((k) => k.replaceAll("_", " ").toLowerCase())
      .join(", ");
    message = `Detected ${assignedKinds.size} report type(s): ${kinds}. Follow the checklist order, then import each file in Teams.`;
  }

  return {
    files: results,
    loadOrder,
    unassignedFiles,
    message,
  };
}
