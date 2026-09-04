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
function rotationPrefix(notes: string | null): { heading: string; rest: string | null } {
  if (!notes) return { heading: "", rest: null };
  const match = /^(Week \d+)(?: of \d+)?\s*[—\-:]*\s*(.*)$/.exec(notes.trim());
  if (!match) return { heading: "", rest: notes };
  return { heading: match[1], rest: match[2] || null };
}

function formatSlotLine(slot: TeamPracticeSlotView, notes: string | null): string {
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
  if (notes) line += ` — ${notes}`;
  return line;
}

export function formatPracticePlanText(slots: TeamPracticeSlotView[]): string {
  const groups = new Map<string, Array<{ slot: TeamPracticeSlotView; notes: string | null }>>();
  for (const slot of slots) {
    const parsed = rotationPrefix(slot.notes);
    const list = groups.get(parsed.heading) ?? [];
    list.push({ slot, notes: parsed.rest });
    groups.set(parsed.heading, list);
  }
  const headings = [...groups.keys()].sort();
  const lines: string[] = [];
  for (const heading of headings) {
    if (heading) lines.push(heading);
    for (const item of groups.get(heading) ?? []) {
      lines.push(formatSlotLine(item.slot, item.notes));
    }
  }
  return lines.join("\n");
}
