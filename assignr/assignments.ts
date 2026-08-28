import { assignrFetch, AssignrApiError } from "@/lib/assignr/client";
import type {
  AssignrAssignment,
  AssignrAssignmentConfirmPayload,
} from "@/lib/assignr/types";

export function formatAssignrApiError(error: unknown) {
  if (error instanceof AssignrApiError) {
    try {
      const parsed = JSON.parse(error.body) as { message?: string; error?: string };
      return parsed.message || parsed.error || error.message;
    } catch {
      return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export async function getAssignrAssignment(assignmentId: string | number) {
  return assignrFetch<AssignrAssignment>(`/api/v2/assignments/${assignmentId}`);
}

export async function confirmAssignrAssignment(
  assignmentId: string | number,
  payload: AssignrAssignmentConfirmPayload,
) {
  return assignrFetch(`/api/v2/assignments/${assignmentId}/confirm`, {
    method: "POST",
    body: payload,
    retryOnConflict: false,
  });
}

export async function assignOfficialToAssignment(
  assignmentId: string | number,
  officialId: string | number,
) {
  const bodyOptions = [
    { user_id: Number(officialId) },
    { official_id: Number(officialId) },
  ];
  let lastError: unknown;

  for (const body of bodyOptions) {
    try {
      return await assignrFetch(`/api/v2/assignments/${assignmentId}/assign`, {
        method: "POST",
        body,
        contentType: "json",
        retryOnConflict: false,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Assignr rejected the umpire assignment request.");
}

export async function unassignAssignrGame(gameId: string | number) {
  return assignrFetch(`/api/v2/games/${gameId}/unassign`, {
    method: "PUT",
    retryOnConflict: false,
  });
}
