/**
 * Parse SportsConnect CSV/XLSX export bytes into headers + sample rows (client-safe pure logic uses xlsx).
 */
import * as XLSX from "xlsx";

export const SPORTS_CONNECT_INGEST_MAX_BYTES = 15 * 1024 * 1024;
export const SPORTS_CONNECT_INGEST_SAMPLE_ROWS = 50;

export type ParsedSportsConnectExport = {
  fileName: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  totalRowCount: number;
};

function extensionOf(fileName: string): string {
  const lower = fileName.toLowerCase();
  const i = lower.lastIndexOf(".");
  return i >= 0 ? lower.slice(i) : "";
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

  const workbook = XLSX.read(data, {
    type: "array",
    raw: false,
  });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!firstSheet) {
    return { fileName, headers: [], rows: [], totalRowCount: 0 };
  }

  const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: false,
  });
  const headers = allRows[0] ? Object.keys(allRows[0]) : [];
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

  return {
    fileName,
    headers,
    rows: allRows.slice(0, sampleLimit),
    totalRowCount: allRows.length,
  };
}

export function isAllowedSportsConnectExportName(fileName: string): boolean {
  const ext = extensionOf(fileName);
  return ext === ".csv" || ext === ".xlsx" || ext === ".xls";
}
