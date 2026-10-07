const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * Central-time timestamp for the tickets page.
 * Built from numeric Intl parts so server and browser HTML match.
 * `DateTimeFormat#format()` inserts a narrow no-break space before AM/PM in
 * browsers and a normal space in Node, which shows up as a hydration error.
 */
export function formatScoutWhen(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "never";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const monthIndex = Number(value("month")) - 1;
  const month = MONTHS[monthIndex];
  const day = Number(value("day"));
  let hour = Number(value("hour"));
  const minute = value("minute");
  if (!month || !Number.isInteger(day) || !Number.isInteger(hour) || !/^\d{2}$/.test(minute)) return "never";
  if (hour === 24) hour = 0;

  const dayPeriod = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${month} ${day}, ${hour12}:${minute} ${dayPeriod}`;
}
