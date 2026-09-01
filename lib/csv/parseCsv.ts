/**
 * Generic, quote-aware CSV parsing -- handles quoted fields containing
 * commas/newlines and escaped ("") quotes. Extracted from
 * lib/paypal/parseCsv.ts so other CSV importers (e.g. the draft player
 * pool) share one implementation instead of drifting apart.
 */

export function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQ = !inQ;
      cur += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQ) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (cur) lines.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      cols.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}
