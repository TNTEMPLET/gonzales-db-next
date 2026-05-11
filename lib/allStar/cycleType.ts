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

type CycleStatus = "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";

type CycleVotingWindow = {
  status: CycleStatus;
  publishedAt?: string | null;
  closedAt?: string | null;
};

export function isPublishedCycleWithinOpenWindow(cycle: CycleVotingWindow) {
  if (cycle.status !== "PUBLISHED") return false;
  const now = Date.now();
  const openAt = cycle.publishedAt ? new Date(cycle.publishedAt).getTime() : null;
  const closeAt = cycle.closedAt ? new Date(cycle.closedAt).getTime() : null;
  if (openAt !== null && !Number.isNaN(openAt) && now < openAt) return false;
  if (closeAt !== null && !Number.isNaN(closeAt) && now >= closeAt) return false;
  return true;
}

export function getCycleStatusChipLabel(cycle: CycleVotingWindow) {
  if (isPublishedCycleWithinOpenWindow(cycle)) return "Opened";
  return cycle.status;
}
