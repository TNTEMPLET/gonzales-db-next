/**
 * Pure admin UI helpers for tournament brackets console (Phase 4b).
 */

export type ProjectStatus = "DRAFT" | "READY" | "ARCHIVED";
export type ProjectSortMode = "priority" | "recent" | "season" | "name";
export type ProjectSortDirection = "asc" | "desc";

export type ProjectRowLike = {
  id: string;
  name: string;
  status: ProjectStatus;
  priority: number;
  seasonYear: number;
  updatedAt: string;
};

export const PROJECT_STATUS_PRIORITY: Record<ProjectStatus, number> = {
  READY: 0,
  DRAFT: 1,
  ARCHIVED: 2,
};

export function projectStatusLabel(status: ProjectStatus) {
  if (status === "READY") return "Live";
  if (status === "ARCHIVED") return "Archived";
  return "Draft";
}

export function projectStatusHelp(status: ProjectStatus) {
  if (status === "READY") {
    return "Live brackets appear on the public Tournaments page.";
  }
  if (status === "ARCHIVED") {
    return "Archived brackets are hidden from public pages and normal active workflows.";
  }
  return "Draft brackets stay hidden while schedules, teams, and scores are being checked.";
}

export function compareByProjectName(
  left: ProjectRowLike,
  right: ProjectRowLike,
): number {
  return left.name.localeCompare(right.name, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
}

export function compareByUpdatedAtAsc(
  left: ProjectRowLike,
  right: ProjectRowLike,
): number {
  const leftTime = Date.parse(left.updatedAt);
  const rightTime = Date.parse(right.updatedAt);
  return (
    (Number.isFinite(leftTime) ? leftTime : 0) -
    (Number.isFinite(rightTime) ? rightTime : 0)
  );
}

function comparePublishedBrackets(
  left: ProjectRowLike,
  right: ProjectRowLike,
): number {
  const statusCompare =
    PROJECT_STATUS_PRIORITY[left.status] - PROJECT_STATUS_PRIORITY[right.status];
  return statusCompare || compareByProjectName(left, right);
}

export function sortProjectsForAdmin<T extends ProjectRowLike>(
  projects: T[],
  sortMode: ProjectSortMode,
  sortDirection: ProjectSortDirection,
): T[] {
  return [...projects].sort((left, right) => {
    let result: number;
    if (sortMode === "recent") {
      result =
        compareByUpdatedAtAsc(left, right) || compareByProjectName(left, right);
    } else if (sortMode === "season") {
      result =
        left.seasonYear - right.seasonYear ||
        comparePublishedBrackets(left, right);
    } else if (sortMode === "name") {
      result =
        compareByProjectName(left, right) || left.seasonYear - right.seasonYear;
    } else {
      const priorityCompare = (left.priority ?? 0) - (right.priority ?? 0);
      const statusCompare =
        PROJECT_STATUS_PRIORITY[left.status] -
        PROJECT_STATUS_PRIORITY[right.status];
      result =
        priorityCompare ||
        statusCompare ||
        comparePublishedBrackets(left, right);
    }
    return sortDirection === "asc" ? result : -result;
  });
}

export function apiErrorMessage(
  json: { error?: string; hint?: string },
  fallback: string,
) {
  const base = json.error || fallback;
  return json.hint ? `${base} — ${json.hint}` : base;
}

export function formatClientFetchError(
  err: unknown,
  fallback: string,
): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message.trim();
  if (
    msg === "fetch failed" ||
    msg.includes("ECONNRESET") ||
    msg.includes("network")
  ) {
    return "Could not reach the server (connection lost or timed out). Wait a few seconds and use Retry, or refresh the page.";
  }
  if (msg.startsWith("Bracket save rejected:")) return msg;
  return msg || fallback;
}
