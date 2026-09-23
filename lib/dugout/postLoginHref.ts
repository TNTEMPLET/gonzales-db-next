export function isSafeNextPath(path: string | null | undefined): path is string {
  // Relative paths only — guards against an open redirect via a
  // protocol-relative ("//evil.com") or absolute-URL "next" value.
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

/**
 * Public-header login landing:
 * 1. honor a safe `?next=`
 * 2. Park Director and up → /admin (even if they also coach)
 * 3. coaches → /dugout
 * 4. everyone else → /
 */
export function getPostLoginHref(params: {
  isAdmin?: boolean;
  isCoach?: boolean;
  nextParam?: string | null;
}): string {
  if (isSafeNextPath(params.nextParam)) return params.nextParam;
  if (params.isAdmin) return "/admin";
  if (params.isCoach) return "/dugout";
  return "/";
}
