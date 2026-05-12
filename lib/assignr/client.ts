import {
  getAssignrApiBaseUrl,
  getAssignrOAuthScope,
  getAssignrTokenBaseUrl,
} from "@/lib/assignr/config";

const HAL_ACCEPT = "application/vnd.assignr.v2.hal+json";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

export class AssignrApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string, message?: string) {
    super(message || `Assignr API error ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export type AssignrFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
  retryOnConflict?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response: Response) {
  const resetSeconds = response.headers.get("X-Ratelimit-Reset-Seconds-Remaining");
  if (resetSeconds) {
    const seconds = Number.parseFloat(resetSeconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }
  return 1500;
}

async function requestAssignrToken(): Promise<TokenCache> {
  const clientId = process.env.ASSIGNR_CLIENT_ID;
  const clientSecret = process.env.ASSIGNR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing ASSIGNR_CLIENT_ID or ASSIGNR_CLIENT_SECRET in environment",
    );
  }

  const response = await fetch(`${getAssignrTokenBaseUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: getAssignrOAuthScope(),
    }),
    cache: "no-store",
  });

  const body = await response.text();
  if (!response.ok) {
    throw new AssignrApiError(response.status, body, `Assignr token error ${response.status}`);
  }

  const data = JSON.parse(body) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("No access_token received from Assignr");
  }

  const expiresIn = Number.isFinite(data.expires_in) ? Number(data.expires_in) : 3600;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
  };
}

export async function getAssignrAccessToken(forceRefresh = false) {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }
  tokenCache = await requestAssignrToken();
  return tokenCache.accessToken;
}

export function clearAssignrTokenCache() {
  tokenCache = null;
}

function buildAssignrUrl(path: string, searchParams?: AssignrFetchOptions["searchParams"]) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${getAssignrApiBaseUrl()}${normalizedPath}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function assignrFetch<T>(
  path: string,
  options: AssignrFetchOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const maxAttempts = options.retryOnConflict === false ? 1 : 3;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    const token = await getAssignrAccessToken(attempt > 1);
    const headers: Record<string, string> = {
      Accept: HAL_ACCEPT,
      Authorization: `Bearer ${token}`,
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = HAL_ACCEPT;
    }

    const response = await fetch(buildAssignrUrl(path, options.searchParams), {
      method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: options.cache ?? (method === "GET" ? "default" : "no-store"),
      next: options.next,
    });

    if (response.status === 429 && attempt < maxAttempts) {
      await sleep(parseRetryAfterMs(response));
      continue;
    }

    if (response.status === 409 && options.retryOnConflict !== false && attempt < maxAttempts) {
      await sleep(250);
      continue;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!response.ok) {
      throw new AssignrApiError(response.status, text);
    }

    if (!text.trim()) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  throw new Error("Assignr request exhausted retry attempts");
}

export async function assignrFetchAllPages<TItem>(params: {
  path: string;
  collectionKey: string;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
  limit?: number;
  maxPages?: number;
  cache?: RequestCache;
  next?: { revalidate?: number | false; tags?: string[] };
}) {
  const limit = params.limit ?? 50;
  const maxPages = params.maxPages ?? 20;
  const items: TItem[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await assignrFetch<{
      _embedded?: Record<string, TItem[]>;
      page?: { pages?: number };
    }>(params.path, {
      searchParams: {
        ...params.searchParams,
        page,
        limit,
      },
      cache: params.cache,
      next: params.next,
    });

    const pageItems = data._embedded?.[params.collectionKey] ?? [];
    items.push(...pageItems);
    const totalPages = data.page?.pages ?? 1;
    if (pageItems.length === 0 || page >= totalPages) {
      break;
    }
  }

  return items;
}
