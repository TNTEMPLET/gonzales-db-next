import { parseCsvLine, splitCsvLines } from "@/lib/csv/parseCsv";

export type PaypalCsvRow = {
  date: string;
  time: string;
  timezone: string;
  payerName: string;
  type: string;
  status: string;
  grossCents: number;
  txId: string;
  itemTitle: string;
  playerNote: string;
  quantity: number;
};

/** Parse a PayPal activity CSV export. Strips UTF-8 BOM if present. */
export function parsePaypalCsv(csvText: string): PaypalCsvRow[] {
  // Strip BOM variants
  const text = csvText.replace(/^﻿/, "").replace(/^ï»¿/, "");

  const lines = splitCsvLines(text);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);

  const iDate = col("Date");
  const iTime = col("Time");
  const iTz = col("TimeZone");
  const iName = col("Name");
  const iType = col("Type");
  const iStatus = col("Status");
  const iGross = col("Gross");
  const iTxId = col("Transaction ID");
  const iTitle = col("Item Title");
  const iOpt1 = col("Option 1 Value");
  const iQty = col("Quantity");

  const rows: PaypalCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const c = parseCsvLine(line);

    if ((c[iStatus] ?? "") !== "Completed") continue;

    const grossStr = (c[iGross] ?? "").replace(/,/g, "");
    const gross = parseFloat(grossStr);
    if (isNaN(gross) || gross <= 0) continue;

    const txId = (c[iTxId] ?? "").trim();
    if (!txId) continue;

    rows.push({
      date: c[iDate] ?? "",
      time: c[iTime] ?? "",
      timezone: c[iTz] ?? "",
      payerName: c[iName] ?? "",
      type: c[iType] ?? "",
      status: c[iStatus] ?? "",
      grossCents: Math.round(gross * 100),
      txId,
      itemTitle: c[iTitle] ?? "",
      playerNote: c[iOpt1] ?? "",
      quantity: parseInt(c[iQty] ?? "1", 10) || 1,
    });
  }
  return rows;
}

/** Returns true if this row is an all-star participation fee (not caps, etc.). */
export function isAllStarParticipationFee(row: PaypalCsvRow): boolean {
  const t = row.itemTitle.toLowerCase();
  if (t.includes("cap")) return false;
  return (t.includes("all star") || t.includes("all-star")) && t.includes("fee");
}

/** Detect org from item title. */
export function detectOrgFromItemTitle(
  itemTitle: string,
): "gonzales" | "ascension" | null {
  const t = itemTitle.toLowerCase();
  if (t.includes("gonzales")) return "gonzales";
  if (t.includes("ap little league") || t.includes("ap baseball")) return "ascension";
  return null;
}

/** Normalize a string for comparison: lowercase, strip punctuation, collapse spaces. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Score how well a PayPal player note matches a player's full name.
 * Returns 0–1. Threshold guide: ≥ 0.85 = high confidence, 0.5–0.85 = review.
 */
export function scoreNameMatch(note: string, playerFullName: string): number {
  const normNote = normalize(note);
  const normName = normalize(playerFullName);
  if (!normNote || !normName) return 0;

  // Exact full-name substring
  if (normNote.includes(normName)) return 1.0;

  const parts = normName.split(" ").filter(Boolean);
  if (parts.length === 0) return 0;

  const lastName = parts[parts.length - 1];
  const firstName = parts[0];
  const noteWords = new Set(normNote.split(/\s+/));

  const lastInNote = noteWords.has(lastName) || normNote.includes(lastName);
  const firstInNote = noteWords.has(firstName) || normNote.includes(firstName);

  // Last + first both present
  if (lastInNote && firstInNote) return 0.9;

  // Last + first initial present
  if (lastInNote && firstName.length > 0 && normNote.includes(firstName[0]!)) return 0.7;

  // Last name only (needs length ≥ 5 to avoid false positives)
  if (lastInNote && lastName.length >= 5) return 0.5;

  return 0;
}

