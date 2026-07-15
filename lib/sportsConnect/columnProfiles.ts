/**
 * Pure column-header detection for SportsConnect-style exports.
 */
import { SPORTS_CONNECT_REPORT_CATALOG } from "./reportCatalog";
import type { ColumnDetectResult, SportsConnectReportKind } from "./types";

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, " ");
}

function headerSet(headers: string[]): Set<string> {
  return new Set(headers.map(normalizeHeader).filter(Boolean));
}

function groupMatched(
  headers: Set<string>,
  group: string[],
): boolean {
  return group.some((alias) => headers.has(normalizeHeader(alias)));
}

/**
 * Score how well a header row matches each report kind.
 * Required groups drive confidence; optional hints add small boosts.
 */
export function detectSportsConnectReport(
  headers: string[],
): ColumnDetectResult {
  const set = headerSet(headers);
  const scores = {
    PLAYER_REG: 0,
    COACH_VOLUNTEER: 0,
    TEAM_LIST: 0,
  } satisfies Record<SportsConnectReportKind, number>;

  const missingByKind: Record<SportsConnectReportKind, string[][]> = {
    PLAYER_REG: [],
    COACH_VOLUNTEER: [],
    TEAM_LIST: [],
  };

  const matchedHeaders: string[] = [];

  for (const entry of SPORTS_CONNECT_REPORT_CATALOG) {
    let requiredHits = 0;
    const requiredTotal = entry.requiredColumnGroups.length;
    for (const group of entry.requiredColumnGroups) {
      if (groupMatched(set, group)) {
        requiredHits += 1;
        for (const alias of group) {
          if (set.has(normalizeHeader(alias))) {
            const original = headers.find(
              (h) => normalizeHeader(h) === normalizeHeader(alias),
            );
            if (original && !matchedHeaders.includes(original)) {
              matchedHeaders.push(original);
            }
          }
        }
      } else {
        missingByKind[entry.kind].push(group);
      }
    }
    const requiredScore =
      requiredTotal > 0 ? requiredHits / requiredTotal : 0;

    let optionalHits = 0;
    for (const hint of entry.optionalColumnHints) {
      if (set.has(normalizeHeader(hint))) {
        optionalHits += 1;
        const original = headers.find(
          (h) => normalizeHeader(h) === normalizeHeader(hint),
        );
        if (original && !matchedHeaders.includes(original)) {
          matchedHeaders.push(original);
        }
      }
    }
    const optionalBoost =
      entry.optionalColumnHints.length > 0
        ? Math.min(0.25, (optionalHits / entry.optionalColumnHints.length) * 0.25)
        : 0;

    // Stronger weight for full required match.
    scores[entry.kind] = Math.min(1, requiredScore * 0.85 + optionalBoost);

    // Bonus signals that separate player vs coach sheets.
    if (entry.kind === "PLAYER_REG") {
      if (
        set.has("player full name") ||
        set.has("participant name") ||
        set.has("player first name")
      ) {
        scores.PLAYER_REG = Math.min(1, scores.PLAYER_REG + 0.1);
      }
      if (set.has("order payment status") || set.has("order no")) {
        scores.PLAYER_REG = Math.min(1, scores.PLAYER_REG + 0.05);
      }
    }
    if (entry.kind === "COACH_VOLUNTEER") {
      if (set.has("volunteer role") || set.has("role")) {
        scores.COACH_VOLUNTEER = Math.min(1, scores.COACH_VOLUNTEER + 0.1);
      }
      if (set.has("email") && !set.has("player full name")) {
        scores.COACH_VOLUNTEER = Math.min(1, scores.COACH_VOLUNTEER + 0.05);
      }
    }
    if (entry.kind === "TEAM_LIST") {
      if (set.has("mlb team") || (set.has("age group") && set.has("team name"))) {
        scores.TEAM_LIST = Math.min(1, scores.TEAM_LIST + 0.1);
      }
      // Penalize if looks like a full player registration dump.
      if (set.has("player full name") || set.has("user email")) {
        scores.TEAM_LIST = Math.max(0, scores.TEAM_LIST - 0.3);
      }
    }
  }

  const ranked = (
    Object.entries(scores) as [SportsConnectReportKind, number][]
  ).sort((a, b) => b[1] - a[1]);

  const [bestKind, bestScore] = ranked[0] ?? [null, 0];
  const secondScore = ranked[1]?.[1] ?? 0;

  // Require clear winner + minimum confidence.
  const confident =
    bestKind &&
    bestScore >= 0.55 &&
    (bestScore - secondScore >= 0.08 || bestScore >= 0.85);

  const reportKind = confident ? bestKind : null;
  const missingRequiredGroups = reportKind
    ? missingByKind[reportKind]
    : bestKind
      ? missingByKind[bestKind]
      : [];

  let message: string;
  if (reportKind) {
    message = `Detected ${reportKind.replaceAll("_", " ").toLowerCase()} export (${Math.round(bestScore * 100)}% confidence).`;
  } else if (bestKind && bestScore >= 0.35) {
    message = `Closest match is ${bestKind.replaceAll("_", " ").toLowerCase()} (${Math.round(bestScore * 100)}%), but confidence is low. Check required columns.`;
  } else {
    message =
      "Could not match headers to a known SportsConnect export. Use the report catalog checklist.";
  }

  return {
    reportKind,
    confidence: bestScore,
    scores,
    matchedHeaders,
    missingRequiredGroups,
    message,
  };
}

/** Extract header row keys from a plain object row or string array. */
export function headersFromRow(row: Record<string, unknown> | string[]): string[] {
  if (Array.isArray(row)) {
    return row.map((h) => String(h ?? "").trim()).filter(Boolean);
  }
  return Object.keys(row);
}
