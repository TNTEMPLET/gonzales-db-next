import { normalizeTeamNameForMatch } from "@/lib/gamechanger/matchEventsToBracket";

export type TeamLabelMappingSuggestion = {
  from: string;
  to: string;
};

/** Suggest bracket label → canonical name when normalized strings match a candidate. */
export function suggestTeamLabelMappings(
  bracketLabels: string[],
  candidateNames: string[],
): TeamLabelMappingSuggestion[] {
  const byNorm = new Map<string, string>();
  for (const candidate of candidateNames) {
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const norm = normalizeTeamNameForMatch(trimmed);
    if (!norm || byNorm.has(norm)) continue;
    byNorm.set(norm, trimmed);
  }

  const suggested: TeamLabelMappingSuggestion[] = [];
  for (const from of bracketLabels) {
    const norm = normalizeTeamNameForMatch(from);
    if (!norm) continue;
    const to = byNorm.get(norm);
    if (to && to !== from.trim()) {
      suggested.push({ from: from.trim(), to });
    }
  }
  return suggested;
}

export function candidateNamesForMapping(
  gameChangerTeamNames: string[],
  rosterTeamNames: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...gameChangerTeamNames, ...rosterTeamNames]) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = normalizeTeamNameForMatch(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((a, b) => a.localeCompare(b, "en-US", { numeric: true, sensitivity: "base" }));
}
