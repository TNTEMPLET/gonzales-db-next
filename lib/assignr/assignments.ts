import { assignrFetch } from "@/lib/assignr/client";
import type {
  AssignrAssignment,
  AssignrAssignmentConfirmPayload,
} from "@/lib/assignr/types";

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

export async function unassignAssignrGame(gameId: string | number) {
  return assignrFetch(`/api/v2/games/${gameId}/unassign`, {
    method: "PUT",
    retryOnConflict: false,
  });
}
