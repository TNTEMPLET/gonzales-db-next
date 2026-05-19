const AGE_GROUP_RE = /\b(\d{1,2})\s*U\b/i;

/** Pick the roster age group key that best matches bracket metadata. */
export function resolveRosterAgeGroup(
  availableAgeGroups: string[],
  hints: {
    rosterAgeGroup?: string | null;
    championAgeGroupLabel?: string | null;
    divisionLabel?: string | null;
  },
): string {
  const normalizedAvailable = availableAgeGroups.map((ag) => ag.trim()).filter(Boolean);
  if (normalizedAvailable.length === 0) return "";

  const candidates: string[] = [];
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) candidates.push(trimmed);
  };

  push(hints.rosterAgeGroup);
  push(hints.championAgeGroupLabel);

  const division = hints.divisionLabel?.trim() ?? "";
  if (division) {
    candidates.push(division);
    const match = division.match(AGE_GROUP_RE);
    if (match) {
      candidates.push(`${match[1]}U`);
      candidates.push(`${match[1]} U`);
    }
  }

  for (const candidate of candidates) {
    const exact = normalizedAvailable.find((ag) => ag.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;

    const loose = normalizedAvailable.find(
      (ag) =>
        ag.toLowerCase().startsWith(candidate.toLowerCase()) ||
        candidate.toLowerCase().startsWith(ag.toLowerCase()),
    );
    if (loose) return loose;
  }

  return hints.rosterAgeGroup?.trim() ?? "";
}
