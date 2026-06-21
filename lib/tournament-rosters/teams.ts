import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";

const PLACEHOLDER_RE = /^(?:TBD|BYE|W\d+|L\d+|Winner|Loser)$/i;

function addTeam(out: Set<string>, value: string | undefined) {
  const team = value?.trim();
  if (!team || PLACEHOLDER_RE.test(team)) return;
  out.add(team);
}

export function extractRosterTeamsFromBracketSpec(spec: BracketSpec): string[] {
  const out = new Set<string>();
  for (const team of spec.teams ?? []) addTeam(out, team);
  for (const round of spec.rounds ?? []) {
    for (const match of round.matches ?? []) {
      addTeam(out, match.home);
      addTeam(out, match.away);
    }
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b));
}
