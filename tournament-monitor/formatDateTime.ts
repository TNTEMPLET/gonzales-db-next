/** Tournament bracket sites and alerts use Central Time. */
export const TOURNAMENT_DISPLAY_TIME_ZONE = "America/Chicago";

export function formatTournamentDateTime(value: Date | string | null | undefined): string {
  if (!value) return "Not yet";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TOURNAMENT_DISPLAY_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
