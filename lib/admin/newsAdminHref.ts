type SearchValue = string | string[] | undefined;

const FORWARDED_QUERY_KEYS = new Set(["org", "edit"]);

function firstNonEmpty(value: SearchValue): string | undefined {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  for (const entry of values) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** `/admin/news`, keeping a non-empty org and edit query. */
export function adminNewsPath(input: {
  org?: string | null;
  edit?: string | null;
}): string {
  const params = new URLSearchParams();
  const org = input.org?.trim();
  const edit = input.edit?.trim();
  if (org) params.set("org", org);
  if (edit) params.set("edit", edit);
  const query = params.toString();
  return query ? `/admin/news?${query}` : "/admin/news";
}

/**
 * Login return URL for the news editor. `next` is encoded so `org` and `edit`
 * stay on the destination instead of becoming login-page params.
 */
export function adminNewsLoginPath(input: {
  org?: string | null;
  edit?: string | null;
}): string {
  return `/admin/login?next=${encodeURIComponent(adminNewsPath(input))}`;
}

/**
 * Destination for the legacy news-admin door.
 * Forwards only `org` and `edit`, in the order they were supplied.
 */
export function legacyNewsAdminRedirectPath(
  searchParams: URLSearchParams | Record<string, SearchValue>,
): string {
  const params = new URLSearchParams();

  if (searchParams instanceof URLSearchParams) {
    for (const [key, value] of searchParams.entries()) {
      if (!FORWARDED_QUERY_KEYS.has(key)) continue;
      const trimmed = value.trim();
      if (trimmed) params.append(key, trimmed);
    }
  } else {
    for (const [key, raw] of Object.entries(searchParams)) {
      if (!FORWARDED_QUERY_KEYS.has(key)) continue;
      const value = firstNonEmpty(raw);
      if (value) params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/admin/news?${query}` : "/admin/news";
}
