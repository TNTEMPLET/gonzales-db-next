import type { TripAnswers, TripFieldDefPublic } from "@/lib/trip/types";
import { parseAnswersJson, splitPlayerName } from "@/lib/trip/validate";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cellValue(v: string | boolean | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function applyPrefillFallback(
  fields: TripFieldDefPublic[],
  merged: TripAnswers,
  row: {
    playerFullName: string;
    ageGroup: string | null;
    team: string | null;
    jerseyNumber: string | null;
  },
) {
  const { first, last } = splitPlayerName(row.playerFullName);
  for (const f of fields) {
    if (merged[f.key] != null && String(merged[f.key]).trim() !== "") continue;
    if (f.prefillFrom === "playerFullName") merged[f.key] = row.playerFullName;
    if (f.prefillFrom === "playerFirstName") merged[f.key] = first;
    if (f.prefillFrom === "playerLastName") merged[f.key] = last;
    if (f.prefillFrom === "ageGroup") merged[f.key] = row.ageGroup;
    if (f.prefillFrom === "team") merged[f.key] = row.team;
    if (f.prefillFrom === "jerseyNumber") merged[f.key] = row.jerseyNumber;
  }
}

export type TripExportRow = {
  playerFullName: string;
  ageGroup: string | null;
  team: string | null;
  jerseyNumber: string | null;
  status: string;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterPhone: string | null;
  submittedAt: Date | null;
  answersJson: string | null;
  inviteToken?: string;
};

/** Fields safe for tournament-director Google Sheet paste. */
export function directorExportFields(fields: TripFieldDefPublic[]): TripFieldDefPublic[] {
  return [...fields]
    .filter(
      (f) =>
        !f.excludeFromDirectorExport &&
        !f.adminOnly &&
        f.sheetColumn.trim() !== "" &&
        f.section !== "health",
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Build CSV matching Google Sheet headers (sheetColumn order).
 * Director/sheet export never includes health or staff-only fields.
 */
export function buildTripExportCsv(input: {
  fields: TripFieldDefPublic[];
  rows: TripExportRow[];
  /** Only emit sheetColumn headers (default true for Sheet paste). */
  sheetOnly?: boolean;
  /** Include invite URL column for admin link packs */
  includeInviteUrl?: boolean;
  inviteBaseUrl?: string;
  /**
   * When true (default for sheetOnly), strip health / non-director columns.
   * When false with sheetOnly false, still never puts health in director columns —
   * health is omitted from all CSV modes by design.
   */
  directorOnly?: boolean;
}): string {
  const sheetOnly = input.sheetOnly !== false;
  const directorOnly = input.directorOnly !== false;

  const fields = directorOnly
    ? directorExportFields(input.fields)
    : [...input.fields]
        .filter((f) => f.sheetColumn.trim() !== "" && !f.excludeFromDirectorExport)
        .sort((a, b) => a.sortOrder - b.sortOrder);

  const headers = [...fields.map((f) => f.sheetColumn)];
  if (!sheetOnly) {
    headers.push(
      "Status",
      "Submitter Name",
      "Submitter Email",
      "Submitter Phone",
      "Submitted At",
    );
  }
  if (input.includeInviteUrl) headers.push("Invite URL");

  const lines = [headers.map(csvEscape).join(",")];

  for (const row of input.rows) {
    const answers = parseAnswersJson(row.answersJson);
    const merged: TripAnswers = { ...answers };
    applyPrefillFallback(fields, merged, row);

    const cells = [...fields.map((f) => csvEscape(cellValue(merged[f.key])))];
    if (!sheetOnly) {
      cells.push(
        csvEscape(row.status),
        csvEscape(row.submitterName ?? ""),
        csvEscape(row.submitterEmail ?? ""),
        csvEscape(row.submitterPhone ?? ""),
        csvEscape(row.submittedAt ? row.submittedAt.toISOString() : ""),
      );
    }
    if (input.includeInviteUrl && input.inviteBaseUrl && row.inviteToken) {
      const url = `${input.inviteBaseUrl.replace(/\/$/, "")}/trip/${row.inviteToken}`;
      cells.push(csvEscape(url));
    }
    lines.push(cells.join(","));
  }

  return lines.join("\n") + "\n";
}
