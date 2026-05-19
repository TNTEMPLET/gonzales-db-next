import * as XLSX from "xlsx";

export type CandidateSheetRow = Record<string, string | number | null | undefined>;

export type NormalizedCandidateRow = {
  rowNumber: number;
  playerFullName: string;
  importedTeamName: string;
  team: string;
  jerseyNumber: string;
};

export type SkippedCandidateRow = {
  rowNumber: number;
  reason: string;
};

export type CandidateSpreadsheetCleanupResult = {
  headers: string[];
  rows: NormalizedCandidateRow[];
  skipped: SkippedCandidateRow[];
  unmatchedImportedTeams: string[];
  suggestedTeamMappings: Record<string, string | null>;
};

export type ExistingTeamOption = {
  teamName: string;
};

function normalizeHeaderKey(key: string) {
  return key
    .trim()
    .toLowerCase()
    .replace(/[#]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getSheetRowValue(row: CandidateSheetRow, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeaderKey));
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    if (!normalizedAliases.has(normalizeHeaderKey(key))) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function normalizeJerseyNumber(value: string) {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (!normalized || lower === "tbd" || lower === "n/a" || lower === "na") {
    return "";
  }
  return normalized;
}

export function resolvePlayerFullNameFromSheetRow(row: CandidateSheetRow) {
  const direct = getSheetRowValue(row, [
    "player",
    "player_full_name",
    "Player",
    "Player Full Name",
    "Participant Full Name",
    "Full Name",
    "name",
    "Name",
  ]);
  if (direct) return direct;
  const first = getSheetRowValue(row, [
    "first_name",
    "First Name",
    "Player First Name",
    "first",
  ]);
  const last = getSheetRowValue(row, [
    "last_name",
    "Last Name",
    "Player Last Name",
    "last",
  ]);
  return [first, last].filter(Boolean).join(" ").trim();
}

export function resolveTeamFromSheetRow(row: CandidateSheetRow) {
  return getSheetRowValue(row, ["team", "Team", "Team Name", "team_name", "assigned_team"]);
}

export function resolveJerseyFromSheetRow(row: CandidateSheetRow) {
  return normalizeJerseyNumber(
    getSheetRowValue(row, [
      "jersey",
      "jersey_number",
      "Jersey Number",
      "Jersey #",
      "Jersey",
      "jersey_no",
      "number",
    ]),
  );
}

export function parseCandidateSpreadsheetBuffer(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!firstSheet) {
    return { headers: [] as string[], rows: [] as CandidateSheetRow[] };
  }
  const rows = XLSX.utils.sheet_to_json<CandidateSheetRow>(firstSheet, {
    raw: false,
    defval: "",
  });
  const headers = rows.length > 0 ? Object.keys(rows[0] || {}) : [];
  return { headers, rows };
}

function normalizeTeamToken(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeTeamValue(value: string) {
  return normalizeTeamToken(value)
    .split(" ")
    .filter(Boolean)
    .filter(
      (token) =>
        !["the", "ll", "dyb", "baseball", "team", "coaches", "coach", "inc", "llc"].includes(
          token,
        ),
    );
}

export function suggestTeamNameMatch(
  importedTeamName: string,
  existingTeamNames: string[],
): string | null {
  const importedNormalized = normalizeTeamToken(importedTeamName);
  const importedTokens = new Set(tokenizeTeamValue(importedTeamName));
  if (importedTokens.size === 0) return null;

  let best: { teamName: string; score: number } | null = null;
  for (const teamName of existingTeamNames) {
    const candidateNormalized = normalizeTeamToken(teamName);
    if (candidateNormalized === importedNormalized) {
      return teamName;
    }
    const candidateTokens = tokenizeTeamValue(teamName);
    if (candidateTokens.length === 0) continue;
    let overlap = 0;
    for (const token of candidateTokens) {
      if (importedTokens.has(token)) overlap += 1;
    }
    const score = overlap / Math.max(importedTokens.size, candidateTokens.length);
    if (!best || score > best.score) {
      best = { teamName, score };
    }
  }

  if (!best || best.score < 0.45) return null;
  return best.teamName;
}

export function applyTeamMappingsToRows(
  rows: Array<{
    playerFullName: string;
    importedTeamName: string;
    team: string;
    jerseyNumber: string;
  }>,
  teamMappings: Record<string, string>,
) {
  return rows.map((row) => {
    const mapped = teamMappings[row.importedTeamName] || teamMappings[row.team];
    return {
      ...row,
      team: mapped?.trim() || row.team,
    };
  });
}

export function normalizeCandidateSpreadsheetRows(
  sheetRows: CandidateSheetRow[],
  options?: {
    existingTeamNames?: string[];
    teamMappings?: Record<string, string>;
  },
): CandidateSpreadsheetCleanupResult {
  const existingTeamNames = options?.existingTeamNames || [];
  const existingSet = new Set(existingTeamNames.map((name) => normalizeTeamToken(name)));
  const teamMappings = options?.teamMappings || {};

  const rows: NormalizedCandidateRow[] = [];
  const skipped: SkippedCandidateRow[] = [];
  const unmatchedImported = new Set<string>();

  sheetRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const playerFullName = resolvePlayerFullNameFromSheetRow(row);
    const importedTeamName = resolveTeamFromSheetRow(row);
    const jerseyNumber = resolveJerseyFromSheetRow(row);

    if (!playerFullName && !importedTeamName && !jerseyNumber) {
      return;
    }

    if (!playerFullName || !importedTeamName) {
      skipped.push({
        rowNumber,
        reason: !playerFullName ? "Missing player name" : "Missing team name",
      });
      return;
    }

    const mappedTeam =
      teamMappings[importedTeamName]?.trim() ||
      teamMappings[importedTeamName.trim()]?.trim() ||
      importedTeamName.trim();

    if (!existingSet.has(normalizeTeamToken(mappedTeam)) && existingTeamNames.length > 0) {
      unmatchedImported.add(importedTeamName.trim());
    }

    rows.push({
      rowNumber,
      playerFullName,
      importedTeamName: importedTeamName.trim(),
      team: mappedTeam,
      jerseyNumber,
    });
  });

  const suggestedTeamMappings: Record<string, string | null> = {};
  for (const importedTeam of unmatchedImported) {
    suggestedTeamMappings[importedTeam] = suggestTeamNameMatch(importedTeam, existingTeamNames);
  }

  return {
    headers: sheetRows.length > 0 ? Object.keys(sheetRows[0] || {}) : [],
    rows,
    skipped,
    unmatchedImportedTeams: Array.from(unmatchedImported).sort((a, b) => a.localeCompare(b)),
    suggestedTeamMappings,
  };
}

export function buildCandidateImportCsv(
  rows: Array<{ playerFullName: string; team: string; jerseyNumber: string }>,
) {
  const lines = ["player_full_name,team,jersey_number"];
  for (const row of rows) {
    const escape = (value: string) => {
      if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
      return value;
    };
    lines.push(
      [escape(row.playerFullName), escape(row.team), escape(row.jerseyNumber)].join(","),
    );
  }
  return lines.join("\n");
}
