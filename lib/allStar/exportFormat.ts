export type AllStarCycleExportMeta = {
  title: string | null;
  seasonYear: number;
  ageGroup: string;
  organizationId: string;
};

export function getAllStarCycleDisplayName(cycle: {
  title: string | null;
  seasonYear: number;
  ageGroup: string;
}) {
  const title = cycle.title?.trim();
  if (title) return title;
  return `${cycle.seasonYear} ${cycle.ageGroup}`;
}

export function slugifyAllStarExportName(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildAllStarExportFilename(cycleName: string, ...parts: string[]) {
  return slugifyAllStarExportName([...parts, cycleName].filter(Boolean).join("-"));
}
