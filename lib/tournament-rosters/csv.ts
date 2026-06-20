export type RosterPlayerInput = {
  firstName: string;
  lastName: string;
  jerseyNumber: string;
};

export type RosterValidationResult = {
  players: RosterPlayerInput[];
  errors: string[];
};

const MAX_PLAYERS = 30;
const MAX_CSV_BYTES = 64_000;
const HEADER_SCAN_LIMIT = 50;

const FIRST_NAME_ALIASES = [
  "first",
  "firstname",
  "givenname",
  "playerfirst",
  "playerfirstname",
  "participantfirst",
  "childfirst",
  "athletefirst",
];
const LAST_NAME_ALIASES = [
  "last",
  "lastname",
  "surname",
  "familyname",
  "playerlast",
  "playerlastname",
  "participantlast",
  "childlast",
  "athletelast",
];
const FULL_NAME_ALIASES = [
  "name",
  "fullname",
  "player",
  "playername",
  "participant",
  "participantname",
  "child",
  "childname",
  "athlete",
  "athletename",
];
const JERSEY_ALIASES = [
  "#",
  "no",
  "num",
  "number",
  "playernumber",
  "jersey",
  "jerseynumber",
  "jerseyno",
  "jersey#",
  "uniform",
  "uniformnumber",
  "uniformno",
  "uniform#",
];

function clean(value: unknown): string {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function csvByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
  return value.length;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9#]+/g, "").trim();
}

function parseDelimitedRows(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let quoted = false;
  const text = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === delimiter && !quoted) {
      row.push(clean(current));
      current = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(clean(current));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += ch;
  }
  row.push(clean(current));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function delimiterScore(input: string, delimiter: string): number {
  const rows = parseDelimitedRows(input, delimiter).slice(0, 20);
  return rows.reduce((total, row) => total + Math.max(0, row.length - 1), 0);
}

function detectDelimiter(input: string): string {
  const candidates = [",", "\t", ";", "|"];
  return candidates.reduce((best, candidate) => (delimiterScore(input, candidate) > delimiterScore(input, best) ? candidate : best), ",");
}

function headerIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) => normalizedAliases.has(header));
}

function scoreHeader(headers: string[]): number {
  const hasFirst = headerIndex(headers, FIRST_NAME_ALIASES) >= 0;
  const hasLast = headerIndex(headers, LAST_NAME_ALIASES) >= 0;
  const hasFull = headerIndex(headers, FULL_NAME_ALIASES) >= 0;
  const hasJersey = headerIndex(headers, JERSEY_ALIASES) >= 0;
  let score = 0;
  if (hasFirst) score += 2;
  if (hasLast) score += 2;
  if (hasFull) score += 2;
  if (hasJersey) score += 3;
  if (hasJersey && ((hasFirst && hasLast) || hasFull)) score += 5;
  return score;
}

function findHeaderRow(rows: string[][]): { rowIndex: number; headers: string[] } | null {
  let best: { rowIndex: number; headers: string[]; score: number } | null = null;
  const scanRows = rows.slice(0, HEADER_SCAN_LIMIT);
  for (let rowIndex = 0; rowIndex < scanRows.length; rowIndex += 1) {
    const headers = (scanRows[rowIndex] ?? []).map(normalizeHeader);
    const score = scoreHeader(headers);
    if (score > (best?.score ?? 0)) best = { rowIndex, headers, score };
  }
  return best && best.score >= 8 ? { rowIndex: best.rowIndex, headers: best.headers } : null;
}

function normalizeSuffix(value: string): string | null {
  const suffix = clean(value).replace(/\.+$/g, "").toUpperCase();
  if (["JR", "SR"].includes(suffix)) return `${suffix[0]}${suffix.slice(1).toLowerCase()}.`;
  if (["II", "III", "IV", "V"].includes(suffix)) return suffix;
  return null;
}

function splitSpaceSeparatedName(value: string, suffix?: string): { firstName: string; lastName: string } {
  const parts = clean(value).replace(/\s+/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: suffix ?? "" };
  const embeddedSuffix = normalizeSuffix(parts[parts.length - 1] ?? "");
  const finalSuffix = suffix ?? embeddedSuffix;
  const firstName = parts[0] ?? "";
  const lastNameParts = embeddedSuffix ? parts.slice(1, -1) : parts.slice(1);
  const lastName = [...lastNameParts, ...(finalSuffix ? [finalSuffix] : [])].join(" ");
  return { firstName, lastName };
}

function splitFullName(value: string): { firstName: string; lastName: string } {
  const normalized = clean(value).replace(/\s+/g, " ");
  if (!normalized) return { firstName: "", lastName: "" };
  if (normalized.includes(",")) {
    const [leftPart, rightPart] = normalized.split(/,(.+)/).map(clean);
    const suffixAfterComma = normalizeSuffix(rightPart ?? "");
    if (suffixAfterComma) return splitSpaceSeparatedName(leftPart, suffixAfterComma);

    const firstParts = clean(rightPart ?? "").split(/\s+/).filter(Boolean);
    const firstName = firstParts[0] ?? "";
    const suffixFromFirst = normalizeSuffix(firstParts[firstParts.length - 1] ?? "");
    const lastName = suffixFromFirst ? `${leftPart} ${suffixFromFirst}`.trim() : leftPart;
    return { firstName, lastName };
  }
  return splitSpaceSeparatedName(normalized);
}

function valueAt(row: string[], index: number): string {
  return index >= 0 ? clean(row[index]) : "";
}

function parseRowsWithHeader(rows: string[][], headerRow: { rowIndex: number; headers: string[] }): RosterPlayerInput[] {
  const firstIndex = headerIndex(headerRow.headers, FIRST_NAME_ALIASES);
  const lastIndex = headerIndex(headerRow.headers, LAST_NAME_ALIASES);
  const fullNameIndex = headerIndex(headerRow.headers, FULL_NAME_ALIASES);
  const jerseyIndex = headerIndex(headerRow.headers, JERSEY_ALIASES);

  const players: RosterPlayerInput[] = [];
  for (const row of rows.slice(headerRow.rowIndex + 1)) {
    let firstName = valueAt(row, firstIndex);
    let lastName = valueAt(row, lastIndex);
    const jerseyNumber = valueAt(row, jerseyIndex);
    if ((!firstName || !lastName) && fullNameIndex >= 0) {
      const fromFullName = splitFullName(valueAt(row, fullNameIndex));
      firstName ||= fromFullName.firstName;
      lastName ||= fromFullName.lastName;
    }
    if (!firstName && !lastName && !jerseyNumber) continue;
    if (firstIndex < 0 && lastIndex < 0 && fullNameIndex >= 0 && (!firstName || !lastName)) continue;
    players.push({ firstName, lastName, jerseyNumber });
  }
  return players;
}

function jerseyCandidateScore(value: string): number {
  const cleaned = clean(value);
  if (/^\d{1,3}$/.test(cleaned)) return 4;
  if (/^\d{1,3}[A-Za-z]$/.test(cleaned)) return 3;
  if (/^[A-Za-z0-9-]{1,3}$/.test(cleaned)) return 1;
  return 0;
}

function inferRowsWithoutHeader(rows: string[][]): RosterPlayerInput[] {
  const nonPlayerHeaders = new Set(["league", "division", "players", "player", "tab", "total", "coach", "coaches", "mgr"]);
  const candidates = rows.filter((row) => row.filter((value) => clean(value)).length >= 2);
  const players: RosterPlayerInput[] = [];
  for (const row of candidates) {
    const values = row.map(clean).filter(Boolean);
    if (values.some((value) => nonPlayerHeaders.has(normalizeHeader(value)))) continue;
    const scoredValues = values.map((value, index) => ({ index, score: jerseyCandidateScore(value) }));
    const bestJersey = scoredValues.sort((a, b) => b.score - a.score)[0];
    if (!bestJersey || bestJersey.score <= 0) continue;
    const jerseyNumber = values[bestJersey.index] ?? "";
    const nameValues = values.filter((_, idx) => idx !== bestJersey.index);
    if (nameValues.length >= 2) {
      players.push({ firstName: nameValues[0] ?? "", lastName: nameValues[nameValues.length - 1] ?? "", jerseyNumber });
      continue;
    }
    if (nameValues.length === 1) {
      const name = splitFullName(nameValues[0] ?? "");
      players.push({ ...name, jerseyNumber });
    }
  }
  return players.length >= 2 ? players : [];
}

export function parseRosterCsv(csv: string): RosterValidationResult {
  if (csvByteLength(csv) > MAX_CSV_BYTES) {
    return { players: [], errors: ["CSV is too large. Keep the file under 64KB."] };
  }
  const rows = parseDelimitedRows(csv, detectDelimiter(csv));
  if (rows.length < 1) return { players: [], errors: ["CSV needs at least one player row."] };
  const headerRow = findHeaderRow(rows);
  const players = headerRow ? parseRowsWithHeader(rows, headerRow) : inferRowsWithoutHeader(rows);
  const result = validateRosterPlayers(players);
  if (!headerRow && result.errors.some((error) => error === "Add at least one player.")) {
    return {
      players: [],
      errors: [
        "Could not find roster columns. Include First Name, Last Name, and Jersey Number columns, or a Player/Name column plus Jersey Number.",
      ],
    };
  }
  return result;
}

export function validateRosterPlayers(
  rawPlayers: RosterPlayerInput[],
  existingErrors: string[] = [],
): RosterValidationResult {
  const errors = [...existingErrors];
  const players: RosterPlayerInput[] = [];
  rawPlayers.forEach((raw, idx) => {
    const rowNumber = idx + 1;
    const firstName = clean(raw.firstName);
    const lastName = clean(raw.lastName);
    const jerseyNumber = clean(raw.jerseyNumber);
    if (!firstName && !lastName && !jerseyNumber) return;
    if (!firstName) errors.push(`Row ${rowNumber}: first name is required.`);
    if (!lastName) errors.push(`Row ${rowNumber}: last name is required.`);
    if (!jerseyNumber) errors.push(`Row ${rowNumber}: jersey number is required.`);
    if (jerseyNumber && !/^[A-Za-z0-9-]{1,8}$/.test(jerseyNumber)) {
      errors.push(`Row ${rowNumber}: jersey number must be 1-8 letters, numbers, or dashes.`);
    }
    if (firstName && lastName && jerseyNumber) players.push({ firstName, lastName, jerseyNumber });
  });
  if (players.length === 0) errors.push("Add at least one player.");
  if (players.length > MAX_PLAYERS) errors.push(`Roster cannot exceed ${MAX_PLAYERS} players.`);
  return { players, errors };
}

export function rosterPlayersToGameChangerCsv(players: RosterPlayerInput[]): string {
  const escape = (value: string) => {
    if (!/[",\n]/.test(value)) return value;
    return `"${value.replace(/"/g, '""')}"`;
  };
  const rows = [["First Name", "Last Name", "Jersey Number"], ...players.map((p) => [p.firstName, p.lastName, p.jerseyNumber])];
  return rows.map((row) => row.map(escape).join(",")).join("\n");
}

export function slugifyRosterFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "roster";
}
