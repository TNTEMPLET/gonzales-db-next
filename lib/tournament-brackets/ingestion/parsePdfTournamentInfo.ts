import type { BracketTournamentInfo } from "@/lib/tournament-brackets/bracketSpec";
import { normalizeBracketTournamentInfo } from "@/lib/tournament-brackets/tournamentInfo";

type FieldKey = keyof BracketTournamentInfo;

const FIELD_PATTERNS: { key: FieldKey; line: RegExp }[] = [
  { key: "division", line: /^Division:\s*(.*)$/i },
  { key: "sites", line: /^Site\(s\):\s*(.*)$/i },
  { key: "updatePhone", line: /^Update\s+Phone:\s*(.*)$/i },
  { key: "tournamentDirector", line: /^Tournament\s+Director:\s*(.*)$/i },
  { key: "nextLevel", line: /^Next(?:\s+Next)?\s+Level:\s*(.*)$/i },
];

const LABEL_LINE =
  /^(Division|Site\(s\)|Update\s+Phone|Tournament\s+Director|Next(?:\s+Next)?\s+Level):/i;

function isLabelLine(line: string): boolean {
  return LABEL_LINE.test(line.trim());
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
      let value = match[1]?.trim() ?? "";
      if (!value) {
        const next = lines[i + 1];
        if (next && !isLabelLine(next)) {
          value = next.trim();
        }
      }
      if (value) draft[key] = value;
    }
  }

  return normalizeBracketTournamentInfo(draft);
}
