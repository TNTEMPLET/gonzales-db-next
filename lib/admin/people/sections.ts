/** People hub section ids — shared by server page and client hub (no React). */

export type PeopleSection = "directory" | "volunteers" | "coaching-interest";

export function parsePeopleSection(
  value: string | null | undefined,
): PeopleSection {
  if (value === "volunteers" || value === "volunteer") return "volunteers";
  if (value === "coaching-interest" || value === "coaching") {
    return "coaching-interest";
  }
  if (value === "directory" || value === "users" || value === "access") {
    return "directory";
  }
  return "directory";
}
