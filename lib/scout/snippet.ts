import { SCOUT_SNIPPET_MAX, SCOUT_SUBJECT_MAX } from "@/lib/scout/config";

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Short preview stored on a ticket. Never a full message body. */
export function toScoutSnippet(value: string | null | undefined): string {
  return clip(collapse(value ?? ""), SCOUT_SNIPPET_MAX);
}

export function toScoutSubject(value: string | null | undefined): string {
  const collapsed = collapse(value ?? "");
  if (!collapsed) return "(no subject)";
  return clip(collapsed, SCOUT_SUBJECT_MAX);
}
