import { assignrFetchAllPages } from "@/lib/assignr/client";
import type { AssignrStatement } from "@/lib/assignr/types";

export async function listAssignrStatements(params?: {
  page?: number;
  limit?: number;
}) {
  return assignrFetchAllPages<AssignrStatement>({
    path: "/api/v2/statements",
    collectionKey: "statements",
    limit: params?.limit ?? 50,
    cache: "no-store",
  });
}
