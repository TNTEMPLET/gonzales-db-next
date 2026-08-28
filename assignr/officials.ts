import { assignrFetch, assignrFetchAllPages } from "@/lib/assignr/client";
import { getAssignrSiteId } from "@/lib/assignr/config";
import type { AssignrUser, AssignrUserUpdatePayload } from "@/lib/assignr/types";
import type { ContentOrgId } from "@/lib/siteConfig";

export async function listAssignrUsers(params?: {
  org?: ContentOrgId;
  siteId?: string;
  page?: number;
  limit?: number;
  search?: string;
}) {
  const siteId = params?.siteId || getAssignrSiteId(params?.org);
  if (!siteId) {
    throw new Error("Missing Assignr site id");
  }

  return assignrFetchAllPages<AssignrUser>({
    path: `/api/v2/sites/${siteId}/users`,
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
