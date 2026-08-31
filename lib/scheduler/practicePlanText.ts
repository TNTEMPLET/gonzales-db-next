const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(":");
  let h = Number.parseInt(hStr, 10);
  const m = (mStr ?? "00").padStart(2, "0");
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

export type TeamPracticeSlotView = {
  dayOfWeek: number;
  startTime: string; // "17:45"
  parkName: string | null;
  fieldName: string | null;
  pairedTeamName: string | null;
  /** true = this team gets the field first, false = second, null = not shared */
  isFirst: boolean | null;
  notes: string | null;
};

/**
 * Renders the human-readable practice-plan text that Team.practicePlan
 * stores, which Coach Corner already displays verbatim -- this is the
 * entire "distribution" mechanism for practice slots, no new coach-facing
 * UI needed. Pure formatting, no I/O.
 */
export function formatPracticePlanText(slots: TeamPracticeSlotView[]): string {
  return slots
    .map((slot) => {
      const day = DAY_NAMES[slot.dayOfWeek] ?? "";
      const time = formatTime12h(slot.startTime);
      const location = [slot.fieldName, slot.parkName].filter(Boolean).join(", ") || "Location TBD";
      let line = `${day} ${time} — ${location}`;
      if (slot.pairedTeamName) {
        line +=
          slot.isFirst === false
            ? ` (shares the field with ${slot.pairedTeamName} — you're second)`
            : ` (shares the field with ${slot.pairedTeamName} — you're first)`;
      }
      if (slot.notes) line += ` — ${slot.notes}`;
      return line;
    })
    .join("\n");
}
