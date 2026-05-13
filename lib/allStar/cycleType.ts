export function isSecondTeamCycleTitle(title: string | null | undefined) {
  return (title || "").toLowerCase().includes("second team");
}

export function buildSecondTeamCycleTitle(title: string | null | undefined) {
  const base = (title || "").trim();
  if (!base) return "Second Team";
  if (isSecondTeamCycleTitle(base)) return base;
  return `${base} (Second Team)`;
}

export function isRunoffCycleTitle(title: string | null | undefined) {
  return (title || "").toLowerCase().includes("(runoff)");
}

export function buildRunoffCycleTitle(title: string | null | undefined) {
  const base = (title || "").trim();
  if (!base) return "Runoff";
  if (isRunoffCycleTitle(base)) return base;
  return `${base} (Runoff)`;
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
  if (!cycle.publishedAt || !cycle.closedAt) return false;
  const now = Date.now();
  const openAt = new Date(cycle.publishedAt).getTime();
  const closeAt = new Date(cycle.closedAt).getTime();
  if (Number.isNaN(openAt) || Number.isNaN(closeAt)) return false;
  if (now < openAt) return false;
  if (now >= closeAt) return false;
  return true;
}

export function getCycleStatusChipLabel(cycle: CycleVotingWindow) {
  if (isPublishedCycleWithinOpenWindow(cycle)) return "Opened";
  return cycle.status;
}
