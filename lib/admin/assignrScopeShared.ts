import {
  getOrgDisplayName,
  type ContentOrgId,
} from "@/lib/siteConfig";

export type AdminAssignrScope = ContentOrgId | "all";

export function isAllSitesAssignrScope(scope: AdminAssignrScope): scope is "all" {
  return scope === "all";
}

export function assignrScopeToQueryParam(scope: AdminAssignrScope): string {
  return scope === "all" ? "" : `org=${scope}`;
}

export function assignrHubHref(org?: ContentOrgId | null) {
  return org ? `/admin/assignr?org=${org}` : "/admin/assignr";
}

export function assignrScopeLabel(scope: AdminAssignrScope) {
  if (scope === "all") return "All Sites";
  return getOrgDisplayName(scope);
}
