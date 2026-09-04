import { timeToMinutes } from "./validation";

/** Squared early/late gap after placing one more game. Sum-of-abs treated 4–0 the same as 2–2. */
export function projectedEarlyLateCost(slotIsEarly: boolean, early: number, late: number): number {
  const nextEarly = early + (slotIsEarly ? 1 : 0);
  const nextLate = late + (slotIsEarly ? 0 : 1);
  const gap = nextEarly - nextLate;
  return gap * gap;
}

/** Slot 1 vs Slot 2 for a division: at or before the midpoint of that division's start times is early. */
export function isEarlyStart(
  startTime: string | null | undefined,
  divisionTimes: Iterable<string | null | undefined>,
): boolean {
  const start = timeToMinutes(startTime);
  if (start === null) return true;
  const unique = [
    ...new Set(
      [...divisionTimes]
        .map((time) => timeToMinutes(time))
        .filter((value): value is number => value !== null),
    ),
  ].sort((a, b) => a - b);
  if (unique.length < 2) return true;
  return start <= (unique[0] + unique[unique.length - 1]) / 2;
}
