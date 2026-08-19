/**
 * Parse SportsConnect CSV/XLSX export bytes into headers + sample rows (client-safe pure logic uses xlsx).
 */
import * as XLSX from "xlsx";

export const SPORTS_CONNECT_INGEST_MAX_BYTES = 15 * 1024 * 1024;
export const SPORTS_CONNECT_INGEST_SAMPLE_ROWS = 50;
export const SPORTS_CONNECT_INGEST_MAX_ROWS = 10_000;

export type ParsedSportsConnectExport = {
  fileName: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  totalRowCount: number;
  exceedsMaxRows?: boolean;
};

function extensionOf(fileName: string): string {
  const lower = fileName.toLowerCase();
  const i = lower.lastIndexOf(".");
  return i >= 0 ? lower.slice(i) : "";
}

/**
  * Prevent formula injection by sanitizing string values that begin with =, +, -, or @
  */
export function sanitizeFormulaValue(val: unknown): unknown {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (
      trimmed.startsWith("=") ||
      trimmed.startsWith("+") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith("@")
    ) {
      return `'${val}`;
    }
  }
  return val;
}

export function sanitizeFormulaCells(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const clean: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(row)) {
      clean[key] = sanitizeFormulaValue(val);
    }
    return clean;
  });
}

/**
 * Parse workbook/CSV buffer. Returns empty headers when unreadable.
 */
export function parseSportsConnectExportBuffer(input: {
  buffer: ArrayBuffer | Buffer | Uint8Array;
  fileName: string;
  sampleRows?: number;
}): ParsedSportsConnectExport {
  const fileName = input.fileName?.trim() || "export.csv";
  const sampleLimit = Math.max(
    1,
    input.sampleRows ?? SPORTS_CONNECT_INGEST_SAMPLE_ROWS,
  );

  const data =
    input.buffer instanceof ArrayBuffer
      ? new Uint8Array(input.buffer)
      : input.buffer;

  if (data.length > SPORTS_CONNECT_INGEST_MAX_BYTES) {
    throw new Error(
      `File size exceeds maximum permitted limit of ${SPORTS_CONNECT_INGEST_MAX_BYTES / (1024 * 1024)}MB`,
    );
  }

  const workbook = XLSX.read(data, {
    type: "array",
    raw: false,
  });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!firstSheet) {
    return { fileName, headers: [], rows: [], totalRowCount: 0 };
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: false,
  });
  const headers = rawRows[0] ? Object.keys(rawRows[0]) : [];

  // If sheet is header-only via sheet_to_json with blank rows, try header row mode.
  if (headers.length === 0) {
    const matrix = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
      header: 1,
      defval: "",
      raw: false,
    }) as unknown as unknown[][];
    const headerRow = (matrix[0] || []).map((c) => String(c ?? "").trim());
    return {
      fileName,
      headers: headerRow.filter(Boolean),
      rows: [],
      totalRowCount: Math.max(0, matrix.length - 1),
    };
  }

  const exceedsMaxRows = rawRows.length > SPORTS_CONNECT_INGEST_MAX_ROWS;
  const sanitizedRows = sanitizeFormulaCells(rawRows);

  return {
    fileName,
    headers,
    rows: sanitizedRows.slice(0, sampleLimit),
    totalRowCount: sanitizedRows.length,
    exceedsMaxRows,
  };
}

/**
 * Native Google Sheets files (as opposed to an uploaded .csv/.xlsx/.xls) have
 * no file extension in their Drive `name` at all — the name is just the
 * spreadsheet's title. `isAllowedSportsConnectExportName` needs the mimeType
 * to recognize these, since the extension check alone always misses them.
 */
export const GOOGLE_SHEETS_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

export function isAllowedSportsConnectExportName(
  fileName: string,
  mimeType?: string,
): boolean {
  if (mimeType === GOOGLE_SHEETS_MIME_TYPE) return true;
  const ext = extensionOf(fileName);
  return ext === ".csv" || ext === ".xlsx" || ext === ".xls";
}

