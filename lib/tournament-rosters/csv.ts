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

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function csvByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
  return value.length;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function pick(row: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value?.trim()) return value.trim();
  }
  return "";
}

export function parseRosterCsv(csv: string): RosterValidationResult {
  if (csvByteLength(csv) > MAX_CSV_BYTES) {
    return { players: [], errors: ["CSV is too large. Keep the file under 64KB."] };
  }
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { players: [], errors: ["CSV needs a header row and at least one player row."] };
  const headers = splitCsvLine(lines[0] ?? "").map(normalizeHeader);
  const errors: string[] = [];
  const players: RosterPlayerInput[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i] ?? "");
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = clean(values[idx]);
    });
    const firstName = pick(row, ["First Name", "First", "Player First Name", "FirstName"]);
    const lastName = pick(row, ["Last Name", "Last", "Player Last Name", "LastName"]);
    const jerseyNumber = pick(row, ["Jersey Number", "Jersey", "Number", "Uniform Number", "JerseyNumber"]);
    const rowNumber = i + 1;
    if (!firstName && !lastName && !jerseyNumber) continue;
    if (!firstName) errors.push(`Row ${rowNumber}: first name is required.`);
    if (!lastName) errors.push(`Row ${rowNumber}: last name is required.`);
    if (!jerseyNumber) errors.push(`Row ${rowNumber}: jersey number is required.`);
    if (firstName && lastName && jerseyNumber) players.push({ firstName, lastName, jerseyNumber });
  }
  return validateRosterPlayers(players, errors);
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
