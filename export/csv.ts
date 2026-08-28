/** Shared CSV cell escaping for admin exports. */

export function csvEscape(value: string): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvCell(value: unknown): string {
  return csvEscape(String(value ?? ""));
}

/** Join a row of already-escaped cells. */
export function csvRow(cells: string[]): string {
  return cells.join(",");
}

/** Build a full CSV document from a header row and data rows (raw values). */
export function toCsvDocument(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
): string {
  const lines = [
    csvRow(headers.map((h) => csvEscape(h))),
    ...rows.map((row) => csvRow(row.map((cell) => csvCell(cell)))),
  ];
  return `${lines.join("\n")}\n`;
}
