/** Lowercased park identity. Blank names share the public schedule's "Park TBD" label. */
export function parkKey(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  return (trimmed || "Park TBD").toLowerCase();
}

export function displayParkName(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed || "Park TBD";
}

function dedupeParks(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const display = displayParkName(name);
    const key = parkKey(display);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out;
}

export type RainoutSelection =
  | { ok: true; allParksOut: boolean; parks: string[] }
  | { ok: false; error: string };

/**
 * One park status for every write path.
 * Unknown names are rejected. Selecting every known park is stored as all parks out.
 */
export function resolveRainoutSelection(input: {
  allParksOut: boolean;
  requestedParks: string[];
  knownParks: string[];
}): RainoutSelection {
  const known = dedupeParks(input.knownParks);
  if (input.allParksOut) {
    return { ok: true, allParksOut: true, parks: [] };
  }

  const requested = input.requestedParks.map((park) => park.trim()).filter(Boolean);
  if (requested.length === 0) {
    return { ok: false, error: "Pick a park, or choose all parks." };
  }

  const resolved: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const name of requested) {
    const canonical = known.find((park) => parkKey(park) === parkKey(name));
    if (!canonical) {
      unknown.push(name.trim());
      continue;
    }
    const key = parkKey(canonical);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(canonical);
  }

  if (unknown.length > 0) {
    const label = unknown.length === 1 ? "Unknown park" : "Unknown parks";
    return { ok: false, error: `${label}: ${unknown.join(", ")}.` };
  }

  if (known.length > 0 && resolved.length === known.length) {
    return { ok: true, allParksOut: true, parks: [] };
  }

  return { ok: true, allParksOut: false, parks: resolved };
}

/** Parks whose games are cancelled by this rainout, used for notification dedupe. */
export function parksTreatedAsOut(input: {
  allParksOut: boolean;
  parks: string[];
  knownParks: string[];
  gameParkNames: string[];
}): string[] {
  if (input.allParksOut) {
    return dedupeParks([...input.knownParks, ...input.gameParkNames]);
  }
  return dedupeParks(input.parks);
}

/** Parks that have not already been included in a live rainout email today. */
export function newlyAffectedParks(treatedAsOut: string[], alreadyNotified: string[]): string[] {
  const notified = new Set(alreadyNotified.map((park) => parkKey(park)));
  return dedupeParks(treatedAsOut).filter((park) => !notified.has(parkKey(park)));
}

export function parkIsListed(parkName: string, parks: string[]): boolean {
  const key = parkKey(parkName);
  return parks.some((park) => parkKey(park) === key);
}
