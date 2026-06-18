import type { BracketTournamentInfo } from "@/lib/tournament-brackets/bracketSpec";
import { normalizeBracketTournamentInfo } from "@/lib/tournament-brackets/tournamentInfo";

type FieldKey = keyof BracketTournamentInfo;

const FIELD_PATTERNS: { key: FieldKey; line: RegExp }[] = [
  { key: "division", line: /\bDivision:\s*(.*)$/i },
  { key: "sites", line: /\bSite\(s\):\s*(.*)$/i },
  { key: "updatePhone", line: /\bUpdate\s+Phone:\s*(.*)$/i },
  { key: "tournamentDirector", line: /\bTournament\s+Director:\s*(.*)$/i },
  { key: "nextLevel", line: /\bNext(?:\s+Next)?\s+Level:\s*(.*)$/i },
];

const LABEL_LINE =
  /\b(Division|Site\(s\)|Update\s+Phone|Tournament\s+Director|Next(?:\s+Next)?\s+Level):/i;

function isLabelLine(line: string): boolean {
  return LABEL_LINE.test(line.trim());
}

function isBracketStructureLine(line: string): boolean {
  const t = line.trim();
  return (
    /^Game\s*#?\s*\d+\b/i.test(t) ||
    /^Winners['’]?\s+Bracket$/i.test(t) ||
    /^Losers['’]?\s+Bracket$/i.test(t) ||
    /^\d+\s*[- ]?\s*Team\s+Little\s+League\s+Bracket$/i.test(t) ||
    /^NOTICE!?$/i.test(t) ||
    /^This schedule is subject/i.test(t) ||
    /^Change!?$/i.test(t) ||
    /^The Number of teams determine/i.test(t) ||
    /^the Game Bracket/i.test(t) ||
    /^[A-Z]$/.test(t)
  );
}

function cleanFieldValue(value: string, key: FieldKey): string {
  let cleaned = value
    .replace(/\s+\b(?:Division|Site\(s\)|Update\s+Phone|Tournament\s+Director|Next(?:\s+Next)?\s+Level):.*$/i, "")
    .replace(/^Winners['’]?\s+Bracket\s+/i, "")
    .replace(/^\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s+\S+\s+/i, "")
    .replace(/^\[\s*/, "")
    .trim();
  if (key === "updatePhone") {
    cleaned = cleaned.match(/\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/)?.[0]?.trim() ?? cleaned;
  }
  return cleaned;
}

function isLikelyStandaloneTeamLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (/\d|\/|:/.test(t)) return false;
  if (isLabelLine(t) || isBracketStructureLine(t)) return false;
  if (/\b(?:Park|Road|Street|Tourney|League|Bracket|Phone|Director|Level)\b/i.test(t)) return false;
  return /[A-Za-z]/.test(t);
}

function collectFieldContinuation(lines: string[], startIndex: number, key: FieldKey): string[] {
  const out: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const next = lines[i]!;
    if (isLabelLine(next) || isBracketStructureLine(next)) break;
    if (key !== "tournamentDirector" && isLikelyStandaloneTeamLine(next)) break;
    out.push(next);
  }
  return out;
}

/**
 * Extract official Little League bracket header fields from PDF text.
 * Values may follow the colon on the same line or on the next non-label line.
 */
export function parsePdfTournamentInfo(text: string): BracketTournamentInfo | undefined {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;

  const draft: BracketTournamentInfo = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const { key, line: pattern } of FIELD_PATTERNS) {
      if (draft[key]?.trim()) continue;
      const match = pattern.exec(line);
      if (!match) continue;
      const firstValue = cleanFieldValue(match[1]?.trim() ?? "", key);
      const continuation = collectFieldContinuation(lines, i, key);
      const parts = [firstValue, ...continuation.map((part) => cleanFieldValue(part, key))]
        .map((part) => part.trim())
        .filter(Boolean);
      const value = parts.join("\n");
      if (value) draft[key] = value;
    }
  }

  return normalizeBracketTournamentInfo(draft);
}
