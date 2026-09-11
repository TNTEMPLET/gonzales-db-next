import { normalizeLooseName, shouldSkipDivisionImport } from "@/lib/admin/teamsImportHelpers";

const ORDER_NO_KEYS = ["Order No", "Order Number", "Order ID"];
const BIRTH_DATE_KEYS = ["Player Birth Date", "Participant Birth Date", "Birth Date", "DOB"];
const FIRST_NAME_KEYS = ["Player First Name", "Participant First Name", "First Name", "first_name"];
const LAST_NAME_KEYS = ["Player Last Name", "Participant Last Name", "Last Name", "last_name"];
const ACCOUNT_FIRST_NAME_KEYS = ["Account First Name", "Parent First Name", "Guardian First Name"];
const ACCOUNT_LAST_NAME_KEYS = ["Account Last Name", "Parent Last Name", "Guardian Last Name"];
const FULL_NAME_KEYS = [
  "Player Full Name",
  "Participant Full Name",
  "Participant Name",
  "Player Name",
  "Child Name",
  "Registrant Name",
  "Full Name",
  "Player",
  "full_name",
];
const DIVISION_KEYS = [
  "Division Name",
  "Division",
  "Program Division",
  "Program Name",
  "Age Group",
  "age_group",
  "AGE_GROUP",
];

export function deriveSportsConnectRowKey(
  orderNo: string,
  fullName: string,
  birthDate: Date | null,
): string {
  const namePart = normalizeLooseName(fullName);
  if (orderNo.trim()) return `${orderNo.trim()}::${namePart}`;
  const dobPart = birthDate ? birthDate.toISOString().slice(0, 10) : "nodob";
  return `${namePart}::${dobPart}`;
}

function parseDateValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function rowValue(row: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const parsed = String(value).trim();
    if (parsed) return parsed;
  }
  const lower = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actualKey = lower.get(key.toLowerCase());
    if (!actualKey) continue;
    const value = row[actualKey];
    if (value === undefined || value === null) continue;
    const parsed = String(value).trim();
    if (parsed) return parsed;
  }
  return "";
}

export function playerRegRowFullName(row: Record<string, unknown>): string {
  return (
    rowValue(row, FULL_NAME_KEYS) ||
    [rowValue(row, FIRST_NAME_KEYS), rowValue(row, LAST_NAME_KEYS)].filter(Boolean).join(" ").trim() ||
    [rowValue(row, ACCOUNT_FIRST_NAME_KEYS), rowValue(row, ACCOUNT_LAST_NAME_KEYS)]
      .filter(Boolean)
      .join(" ")
      .trim()
  );
}

export function enrollmentKeyFromPlayerRegRow(row: Record<string, unknown>): string | null {
  const division = rowValue(row, DIVISION_KEYS);
  if (shouldSkipDivisionImport(division)) return null;
  const fullName = playerRegRowFullName(row);
  if (!fullName) return null;
  const orderNo = rowValue(row, ORDER_NO_KEYS);
  const birthDate = parseDateValue(rowValue(row, BIRTH_DATE_KEYS));
  return deriveSportsConnectRowKey(orderNo, fullName, birthDate);
}

export function enrollmentKeysFromPlayerRegRows(rows: Record<string, unknown>[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const key = enrollmentKeyFromPlayerRegRow(row);
    if (key) keys.add(key);
  }
  return keys;
}
