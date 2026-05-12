import { assignrFetch, assignrFetchAllPages } from "@/lib/assignr/client";
import type { AssignrUser, AssignrUserUpdatePayload } from "@/lib/assignr/types";

export async function listAssignrUsers(params?: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  return assignrFetchAllPages<AssignrUser>({
    path: "/api/v2/users",
    collectionKey: "users",
    limit: params?.limit ?? 50,
    searchParams: {
      ...(params?.search ? { "search[query]": params.search } : {}),
    },
    cache: "no-store",
  });
}

export async function getAssignrUser(userId: string | number) {
  return assignrFetch<AssignrUser>(`/api/v2/users/${userId}`);
}

export async function updateAssignrUser(
  userId: string | number,
  payload: AssignrUserUpdatePayload,
) {
  return assignrFetch<AssignrUser>(`/api/v2/users/${userId}`, {
    method: "PUT",
    body: payload,
  });
}

export function officialDisplayName(user: AssignrUser) {
  const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return fullName || `Official ${user.id ?? ""}`.trim();
}
