/** People hub section ids — shared by server page and client hub (no React). */

export type PeopleSection = "directory" | "volunteers" | "coaching-interest" | "roles";

export function parsePeopleSection(
  value: string | null | undefined,
): PeopleSection {
  if (value === "roles" || value === "role" || value === "role-assignment") return "roles";
  if (value === "volunteers" || value === "volunteer") return "volunteers";
  if (value === "coaching-interest" || value === "coaching") {
    return "coaching-interest";
  }
  return "directory";
}
