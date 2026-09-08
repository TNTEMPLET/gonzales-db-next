const MASCOT_ALIASES: Record<string, string> = {
  a: "athletics",
  as: "athletics",
  athletics: "athletics",
  "red sox": "red sox",
  redsox: "red sox",
};

export function normalizeMascot(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/[.’']/g, "").replace(/\./g, "");
  const compact = trimmed.replace(/\s+/g, " ");
  return MASCOT_ALIASES[compact] ?? MASCOT_ALIASES[compact.replace(/\s/g, "")] ?? compact;
}

export function teamMascotKey(teamName: string): string {
  const head = teamName.split(" - ")[0] ?? teamName;
  return normalizeMascot(head);
}

export function findTeamByMascot<T extends { teamName: string }>(teams: T[], mascot: string): T | null {
  const want = normalizeMascot(mascot);
  return teams.find((team) => teamMascotKey(team.teamName) === want) ?? null;
}

export function fieldNumberFromName(name: string): number | null {
  const trimmed = name.trim();
  const leading = /^(\d{1,2})\b/.exec(trimmed);
  if (leading) return Number(leading[1]);
  const labeled = /\bfield\s+(\d{1,2})\b/i.exec(trimmed);
  if (labeled) return Number(labeled[1]);
  return null;
}

export function isPaulaParkName(name: string | null | undefined): boolean {
  return Boolean(name && /paula/i.test(name));
}
