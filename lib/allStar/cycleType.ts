export function isSecondTeamCycleTitle(title: string | null | undefined) {
  return (title || "").toLowerCase().includes("second team");
}

export function buildSecondTeamCycleTitle(title: string | null | undefined) {
  const base = (title || "").trim();
  if (!base) return "Second Team";
  if (isSecondTeamCycleTitle(base)) return base;
  return `${base} (Second Team)`;
}

export function isFrozenFirstTeamCycle(cycle: {
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  title: string | null;
}) {
  return cycle.status === "CLOSED" && !isSecondTeamCycleTitle(cycle.title);
}
