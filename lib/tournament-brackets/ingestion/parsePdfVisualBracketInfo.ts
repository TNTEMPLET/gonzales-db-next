import type { PdfBracketTemplateMatch } from "@/lib/tournament-brackets/ingestion/parsePdfBracketTemplate";
import { parseScheduleLine } from "@/lib/tournament-brackets/ingestion/parsePdfGameRouting";

function normalizedLines(text: string): string[] {
  return text
    .split(/\n/)
    .map((line) => line.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim())
    .filter(Boolean);
}

function visualCandidateFromLine(line: string): string | null {
  let value = line.replace(/[|{}_]+/g, " ").replace(/\s+/g, " ").trim();
  value = value.replace(/\s+\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s*(?:am|pm)\b.*$/i, "");
  value = value.replace(
    /\s+(?:Update\s+Phone|Tournament\s+Director|Next(?:\s+Next)?\s+Level|Game\s*#?\s*\d+|Loser\s+(?:to|from|of)\b|Winner\s+of\b).*$/i,
    "",
  );
  value = value.replace(/^[.\-:;,\s]+|[.\-:;,\s]+$/g, "").trim();
  if (!value) return null;
  return value;
}

function isLikelyTeamName(value: string): boolean {
  if (value.length < 2 || value.length > 40) return false;
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  if (/\d/.test(value)) return false;
  if (/^Change!?$/i.test(value)) return false;
  if (/^[a-z]/.test(value)) return false;
  const compact = value.replace(/[^a-z]/gi, "").toLowerCase();
  if (
    [
      "division",
      "site",
      "phone",
      "director",
      "level",
      "bracket",
      "winner",
      "loser",
      "champion",
      "notice",
      "schedule",
      "subject",
      "team",
      "teams",
      "determine",
      "final",
      "park",
      "road",
      "street",
      "tourney",
      "littleleague",
      "winners",
      "losers",
      "dochub",
      "revision",
      "revisions",
      "highlighted",
      "yellow",
    ].some((token) => compact.includes(token))
  ) {
    return false;
  }
  if (
    /\b(?:Division|Site|Phone|Director|Level|Bracket|Winner|Loser|Champion|NOTICE|schedule|subject|teams?|determine|Park|Road|Street|St\.?\s+Julien|Tourney|Little\s+League|Winners|Losers|DocHub)\b/i.test(
      value,
    )
  ) {
    return false;
  }
  return /[A-Za-z]/.test(value);
}

function isStructuralLine(line: string): boolean {
  const t = line.trim();
  return (
    /^Game\s*#?\s*\d+\b/i.test(t) ||
    /^Loser\s+to\b/i.test(t) ||
    /^Loser\s+(?:from|of)\s+Game\b/i.test(t) ||
    /^Winner\s+of\s+Game\b/i.test(t) ||
    /^Winners'? Bracket$/i.test(t) ||
    /^Losers'? Bracket$/i.test(t) ||
    /^Champion$/i.test(t) ||
    /^Revisions Highlighted/i.test(t) ||
    /^Top\s+\d+\s+teams?\s+advance/i.test(t) ||
    /^\(?if\s+necessary\)?$/i.test(t) ||
    /^Division:/i.test(t) ||
    /^Site\(s\):/i.test(t) ||
    /^Update\s+Phone:/i.test(t) ||
    /^Tournament\s+Director:/i.test(t) ||
    /^Next(?:\s+Next)?\s+Level:/i.test(t) ||
    /^\d+\s*[- ]?\s*Team\s+Little\s+League\s+Bracket$/i.test(t) ||
    /^[A-Z]$/.test(t) ||
    parseScheduleLine(t) != null
  );
}

function previousVisualValue(lines: string[], gameIndex: number): string | null {
  for (let i = gameIndex - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (/^Game\s*#?\s*\d+\b/i.test(line)) break;
    const candidate = visualCandidateFromLine(line);
    if (candidate && isLikelyTeamName(candidate)) return candidate;
  }
  return null;
}

function nextVisualValue(lines: string[], gameIndex: number): string | null {
  for (let i = gameIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^Game\s*#?\s*\d+\b/i.test(line)) break;
    if (isStructuralLine(line)) continue;
    const candidate = visualCandidateFromLine(line);
    if (candidate && isLikelyTeamName(candidate)) return candidate;
  }
  return null;
}

function gameLineIndexes(lines: string[]): Map<number, number> {
  const indexes = new Map<number, number>();
  lines.forEach((line, index) => {
    const match = /^Game\s*#?\s*(\d+)\b/i.exec(line);
    const gameNumber = Number.parseInt(match?.[1] ?? "", 10);
    if (Number.isFinite(gameNumber) && !indexes.has(gameNumber)) {
      indexes.set(gameNumber, index);
    }
  });
  return indexes;
}

function uniqueComplete(values: Array<string | null>, expectedCount: number): string[] | null {
  if (values.some((value) => !value)) return null;
  const out = values.map((value) => value!.trim()).filter(Boolean);
  if (out.length !== expectedCount) return null;
  if (!out.every(isLikelyTeamName)) return null;
  if (new Set(out.map((value) => value.toLowerCase())).size !== out.length) return null;
  return out;
}

function fiveTeamOcrReadingOrderTeams(lines: string[]): string[] | null {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const firstBracketLine = lines.findIndex((line) => /Winners['’]?\s+Bracket/i.test(line));
  const bracketLines = firstBracketLine >= 0 ? lines.slice(firstBracketLine + 1) : lines;
  for (const line of bracketLines) {
    const candidate = visualCandidateFromLine(line);
    if (!candidate || !isLikelyTeamName(candidate)) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  if (candidates.length < 5) return null;

  // OCR commonly reads the 5-team LL form by columns: C, D, A, B, E.
  const reordered = [candidates[2], candidates[3], candidates[0], candidates[1], candidates[4]];
  return uniqueComplete(reordered, 5);
}

/**
 * Best-effort team-name extraction from visual Little League PDFs.
 *
 * For 5-team LL PDFs, the visible boxes usually read:
 *   Team A / Game 1 / schedule / Team B
 *   Team C / Game 2 / schedule / Team D
 *   Game 3 / schedule / Team E
 */
export function extractVisualPdfTeams(
  text: string,
  template: PdfBracketTemplateMatch,
): string[] | null {
  const lines = normalizedLines(text);
  const games = gameLineIndexes(lines);
  if (template.templateId === "little_league_5_team_de") {
    const positioned = uniqueComplete(
      [
        previousVisualValue(lines, games.get(1) ?? -1),
        nextVisualValue(lines, games.get(1) ?? -1),
        previousVisualValue(lines, games.get(2) ?? -1),
        nextVisualValue(lines, games.get(2) ?? -1),
        nextVisualValue(lines, games.get(3) ?? -1),
      ],
      5,
    );
    return positioned ?? fiveTeamOcrReadingOrderTeams(lines);
  }
  return null;
}
