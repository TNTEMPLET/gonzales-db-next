import type { BracketTournamentInfo } from "@/lib/tournament-brackets/bracketSpec";

export const TOURNAMENT_INFO_FIELD_LABELS = {
  division: "Division",
  sites: "Site(s)",
  updatePhone: "Update Phone",
  tournamentDirector: "Tournament Director",
  nextLevel: "Next Level",
} as const satisfies Record<keyof BracketTournamentInfo, string>;

export type TournamentInfoRow = {
  key: keyof BracketTournamentInfo;
  label: string;
  value: string;
};

export type TournamentInfoField = TournamentInfoRow & {
  lines: string[];
};

function splitManualLines(value: string): string[] {
  return value
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitStreetCity(value: string): { street: string; city: string } | null {
  const match =
    /^(.*?\b(?:road|rd\.?|street|st\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|parkway|pkwy\.?|court|ct\.?|circle|cir\.?|highway|hwy\.?)\b)\s+(.+)$/i.exec(
      value.trim(),
    );
  const street = match?.[1]?.trim();
  const city = match?.[2]?.trim();
  if (!street || !city) return null;
  return { street, city };
}

function splitCommaAddress(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.includes(",")) return [trimmed];
  const parts = trimmed
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return [trimmed];

  const stateZip = parts[parts.length - 1]!;
  const cityPart = parts[parts.length - 2]!;
  const streetCity = splitStreetCity(cityPart);
  const prefix = parts.slice(0, -2);
  const cityStateZip = streetCity
    ? `${streetCity.city}, ${stateZip}`
    : parts.length >= 2
      ? `${cityPart}, ${stateZip}`
      : stateZip;
  const addressPrefix = streetCity ? [...prefix, streetCity.street] : prefix;
  return [...addressPrefix, ...(cityStateZip ? [cityStateZip] : [])].filter(Boolean);
}

function splitVenueAddress(value: string): string[] {
  const lines: string[] = [];
  const normalized = value.trim().replace(/\s+/g, " ");
  const dashMatch = /^(.*?)\s+-\s+(.*)$/.exec(normalized);
  if (dashMatch) {
    const venue = dashMatch[1]?.trim();
    const address = dashMatch[2]?.trim();
    if (venue) lines.push(venue);
    if (address) lines.push(...splitCommaAddress(address));
    return lines.filter(Boolean);
  }
  return splitCommaAddress(normalized);
}

function splitStandardAddressText(value: string): string[] {
  const manualLines = splitManualLines(value);
  const sourceLines = manualLines.length > 0 ? manualLines : [value.trim()];
  const out: string[] = [];

  for (const line of sourceLines) {
    const sections = line
      .split(/\s*;\s*/)
      .map((section) => section.trim())
      .filter(Boolean);
    sections.forEach((section, idx) => {
      if (idx > 0 && out.length > 0) out.push("");
      out.push(...splitVenueAddress(section));
    });
  }

  return out.filter((line, idx, arr) => line || (idx > 0 && idx < arr.length - 1));
}

function splitTournamentDirectorText(value: string): string[] {
  return splitManualLines(value).flatMap((line) =>
    line
      .split(/\s*\/\s*/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function phoneOnlyText(value: string): string {
  const trimmed = value.trim();
  const phoneMatch = /^(\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4})\b/.exec(trimmed);
  return phoneMatch?.[1]?.trim() || trimmed;
}

export function tournamentInfoValueLines(
  key: keyof BracketTournamentInfo,
  value: string,
): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (key === "sites" || key === "nextLevel") {
    return splitStandardAddressText(trimmed);
  }
  if (key === "tournamentDirector") {
    return splitTournamentDirectorText(trimmed);
  }
  if (key === "updatePhone") {
    return splitManualLines(phoneOnlyText(trimmed));
  }
  return splitManualLines(trimmed);
}

export function tournamentInfoRows(info?: BracketTournamentInfo | null): TournamentInfoRow[] {
  if (!info) return [];
  const rows: TournamentInfoRow[] = [];
  for (const key of Object.keys(TOURNAMENT_INFO_FIELD_LABELS) as (keyof BracketTournamentInfo)[]) {
    const value = info[key]?.trim();
    if (!value) continue;
    rows.push({ key, label: TOURNAMENT_INFO_FIELD_LABELS[key], value });
  }
  return rows;
}

export function tournamentInfoFields(info?: BracketTournamentInfo | null): TournamentInfoField[] {
  return tournamentInfoRows(info).map((row) => ({
    ...row,
    lines: tournamentInfoValueLines(row.key, row.value),
  }));
}

export function hasBracketTournamentInfo(info?: BracketTournamentInfo | null): boolean {
  return tournamentInfoRows(info).length > 0;
}

export function normalizeBracketTournamentInfo(
  raw?: BracketTournamentInfo | null,
): BracketTournamentInfo | undefined {
  if (!raw) return undefined;
  const next: BracketTournamentInfo = {};
  for (const key of Object.keys(TOURNAMENT_INFO_FIELD_LABELS) as (keyof BracketTournamentInfo)[]) {
    const value = raw[key]?.trim();
    if (value) next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
