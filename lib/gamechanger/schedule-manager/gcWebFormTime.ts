import type { GcBracketMatchRef } from "@/lib/gamechanger/types";

/** Tournament bracket schedules are America/Chicago; GC web form uses the same local labels. */
const BRACKET_TIME_ZONE = "America/Chicago";

function formatGcFormDateLocal(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRACKET_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).formatToParts(instant);
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const year = parts.find((part) => part.type === "year")?.value ?? "00";
  return `${month}/${day}/${year}`;
}

function formatGcFormTimeLocal(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BRACKET_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
}

function normalizeBracketDateForGcForm(dateLabel: string, year: number): string {
  const match = dateLabel.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return dateLabel.trim();
  const month = match[1]!.padStart(2, "0");
  const day = match[2]!.padStart(2, "0");
  return `${month}/${day}/${String(year).slice(-2)}`;
}

function normalizeBracketTimeForGcForm(time: string | undefined): string {
  const trimmed = time?.trim();
  if (!trimmed) return "12:00 PM";

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return trimmed;

  let hours = Number(match[1]);
  const minutes = match[2]!;
  const meridiemRaw = match[3]?.toLowerCase();
  if (meridiemRaw === "pm" && hours !== 12) hours += 12;
  if (meridiemRaw === "am" && hours === 12) hours = 0;

  const meridiem = hours >= 12 ? "PM" : "AM";
  let displayHours = hours % 12;
  if (displayHours === 0) displayHours = 12;
  return `${displayHours}:${minutes} ${meridiem}`;
}

/** Bracket schedule labels are America/Chicago (CDT uses UTC−5 in summer). */
function parseBracketScheduleMs(ref: GcBracketMatchRef, year = new Date().getFullYear()): number | undefined {
  const dateLabel = ref.dateLabel?.trim();
  if (!dateLabel) return undefined;
  const match = dateLabel.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return undefined;
  const month = Number(match[1]) - 1;
  const day = Number(match[2]);
  let hours = 18;
  let minutes = 0;
  const time = ref.time?.trim();
  if (time) {
    const timeMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
    if (timeMatch) {
      hours = Number(timeMatch[1]);
      minutes = Number(timeMatch[2]);
      const meridiem = timeMatch[3]?.toUpperCase();
      if (meridiem === "PM" && hours !== 12) hours += 12;
      if (meridiem === "AM" && hours === 12) hours = 0;
    }
  }
  return Date.UTC(year, month, day, hours + 5, minutes, 0);
}

/** Values to type into the GameChanger web schedule form (local America/Chicago). */
export function gcWebFormScheduleFromInstant(instant: Date): { gcFormDate: string; gcFormTime: string } {
  return {
    gcFormDate: formatGcFormDateLocal(instant),
    gcFormTime: formatGcFormTimeLocal(instant),
  };
}

export function gcWebFormScheduleFromBracketLabels(
  dateLabel: string,
  time?: string,
  year = new Date().getFullYear(),
): { gcFormDate: string; gcFormTime: string } | null {
  if (!dateLabel?.trim()) return null;
  return {
    gcFormDate: normalizeBracketDateForGcForm(dateLabel, year),
    gcFormTime: normalizeBracketTimeForGcForm(time),
  };
}

export function bracketScheduleToUtcInstant(
  dateLabel: string,
  time?: string,
  year = new Date().getFullYear(),
): Date | undefined {
  const ms = parseBracketScheduleMs({ id: "", home: "", away: "", dateLabel, time }, year);
  if (ms === undefined) return undefined;
  return new Date(ms);
}
