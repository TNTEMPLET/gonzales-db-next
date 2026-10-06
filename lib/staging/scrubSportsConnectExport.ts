import { createHash } from "node:crypto";

export type SportsConnectScrubKind =
  | "keep"
  | "blank"
  | "name"
  | "email"
  | "phone"
  | "street"
  | "birth"
  | "unit";

/**
 * Column policy for a scrubbed SportsConnect export.
 * Medical, insurance, and physician cells are blanked. Birth dates keep
 * year and month and move the day. City and ZIP stay. Person names, emails,
 * phones, and street addresses are replaced.
 */
export function sportsConnectExportColumnKind(header: string): SportsConnectScrubKind {
  const lk = header.trim().toLowerCase();
  if (!lk) return "keep";
  if (/e-?mail/.test(lk)) return "email";
  if (
    /medical|allerg|insur|physician|medication|\bhealth\b|describe the condition|\bdoctor\b|physical condition|tetanus|immuni[sz]|vaccin|shot date|condition/.test(
      lk,
    ) ||
    lk === "policy number"
  ) {
    return "blank";
  }
  if (/(phone|telephone|cellphone|mobile)/.test(lk)) return "phone";
  if (/birth[ _-]?date|date[ _-]?of[ _-]?birth|^dob$|^birthdate$/.test(lk)) return "birth";
  if (
    lk === "unit" ||
    lk.includes("address line 2") ||
    lk.includes("addressline2") ||
    lk.includes("address unit")
  ) {
    return "unit";
  }
  if (
    /street/.test(lk) ||
    lk === "address" ||
    lk === "address line 1" ||
    lk === "addressline1" ||
    lk === "home address" ||
    lk === "mailing address" ||
    lk === "player address"
  ) {
    return "street";
  }
  if (lk === "player" || lk === "participant" || lk === "registrant") return "name";
  if (/name$/.test(lk) && !/(team|division|program|business|product|file|park|item)/.test(lk)) {
    return "name";
  }
  return "keep";
}

export function stagingAliasName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (/^s[0-9a-f]{32}( s[0-9a-f]{32})*$/.test(trimmed)) return trimmed;
  let norm = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) norm = trimmed.toLowerCase();
  return `s${createHash("md5").update(norm).digest("hex")}`;
}

export function stagingEmail(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (trimmed.toLowerCase().endsWith("@example.invalid")) return trimmed;
  const digest = createHash("md5").update(trimmed.toLowerCase()).digest("hex").slice(0, 16);
  return `staging+${digest}@example.invalid`;
}

/** Day-of-month depends only on year and month, matching scripts/staging/scrub.sql. */
export function shiftBirthDateText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "redacted") return value;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const shifted = shiftBirthDay(Number(iso[1]), Number(iso[2]));
    if (!shifted) return "redacted";
    return formatIso(Number(iso[1]), Number(iso[2]), shifted);
  }
  const mdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const year = Number(mdy[3]);
    const month = Number(mdy[1]);
    const shifted = shiftBirthDay(year, month);
    if (!shifted) return "redacted";
    return formatIso(year, month, shifted);
  }
  return "redacted";
}

export function scrubSportsConnectRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const kind = sportsConnectExportColumnKind(key);
    const text = value === null || value === undefined ? "" : String(value);
    if (kind === "blank" || kind === "unit") {
      out[key] = "";
      continue;
    }
    if (kind === "keep" || !text.trim()) {
      out[key] = value ?? "";
      continue;
    }
    if (kind === "name") out[key] = stagingAliasName(text);
    else if (kind === "email") out[key] = stagingEmail(text);
    else if (kind === "phone") out[key] = text.trim() === "+15550000000" ? text : "+15550000000";
    else if (kind === "street") out[key] = text.trim() === "100 Staging Street" ? text : "100 Staging Street";
    else out[key] = shiftBirthDateText(text);
  }
  return out;
}

export function scrubSportsConnectRows(
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((row) => scrubSportsConnectRow(row));
}

function shiftBirthDay(year: number, month: number): number | null {
  if (month < 1 || month > 12) return null;
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const stamp = `${year}-${String(month).padStart(2, "0")}`;
  const bytes = Buffer.from(createHash("md5").update(stamp).digest("hex").slice(0, 8), "hex");
  const hashBits =
    bytes[0]! * 16777216 + bytes[1]! * 65536 + bytes[2]! * 256 + bytes[3]!;
  const shifted = 1 + (hashBits % dim);
  const check = new Date(Date.UTC(year, month - 1, shifted));
  if (check.getUTCMonth() !== month - 1) return null;
  return shifted;
}

function formatIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
