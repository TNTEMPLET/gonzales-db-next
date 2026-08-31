import { getAgeDivisionNumber } from "@/lib/admin/teamsImportHelpers";

/**
 * Default equipment kit label per division, keyed by age (not exact
 * division strings, since those vary by org -- e.g. fallball's "4U TB" vs
 * gonzales' "6U DYB"). Younger divisions need a full tee-ball kit; older
 * divisions bring more of their own gear. Purely a starting point -- the
 * Equipment Checkout panel lets an admin edit the label per team.
 */
const KIT_LABEL_BY_MAX_AGE: readonly [number, string][] = [
  [5, "Tee/Balls/Dots"],
  [6, "Balls and Tee"],
  [12, "Balls/Gear (3)"],
  [Number.POSITIVE_INFINITY, "Balls (1)"],
];

export function getDefaultKitLabel(ageGroup: string): string {
  const age = getAgeDivisionNumber(ageGroup);
  if (age === null) return "Balls (1)";
  for (const [maxAge, label] of KIT_LABEL_BY_MAX_AGE) {
    if (age <= maxAge) return label;
  }
  return "Balls (1)";
}
