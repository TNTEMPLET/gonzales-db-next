export type ScoutSeedEnv = {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
  PROD_DATABASE_URL?: string;
  /** Set to `1` to allow the admin sample-ticket button on a hosted non-production database when VERCEL_ENV is unset. */
  SCOUT_ALLOW_SAMPLE_TICKETS?: string;
};

/**
 * Explicit opt-in. Only the exact string `1` enables it.
 * `true`, `yes`, blank, `0`, and surrounding spaces leave the gate unchanged.
 */
export function scoutSampleTicketsOptIn(env: ScoutSeedEnv): boolean {
  return env.SCOUT_ALLOW_SAMPLE_TICKETS === "1";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return LOCAL_HOSTS.has(normalized) || normalized.endsWith(".localhost");
}

function databaseIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    const port =
      url.port || (url.protocol === "postgresql:" || url.protocol === "postgres:" ? "5432" : "");
    const database = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, "")).toLowerCase();
    return `${url.hostname.toLowerCase()}|${port}|${database}`;
  } catch {
    return null;
  }
}

/** Same host, port, and database name. Credentials and query strings are ignored. */
function sameDatabase(left: string, right: string): boolean {
  const a = databaseIdentity(left);
  const b = databaseIdentity(right);
  if (a && b) return a === b;
  return left === right;
}

function looksLikeProductionName(value: string): boolean {
  return /(^|[._-])prod(uction)?([._-]|$)/i.test(value);
}

/**
 * Synthetic Scout tickets are for local dev and staging only.
 * Production (VERCEL_ENV=production), the same host and database as
 * PROD_DATABASE_URL, and hosts or database names that contain prod are refused.
 * The laptop script only allows a local database. The admin button also
 * refuses a hosted database when VERCEL_ENV is unset, so a local server
 * cannot load samples into a remote production URL.
 * SCOUT_ALLOW_SAMPLE_TICKETS=1 opts that button into a hosted non-production
 * database when VERCEL_ENV is unset (self-hosted staging dev such as apdev).
 * The production refusals above still win, and the flag does not change the script.
 */
export function scoutSyntheticSeedBlockReason(
  env: ScoutSeedEnv,
  surface: "script" | "admin" = "admin",
): string | null {
  const vercelEnv = env.VERCEL_ENV?.trim() ?? "";
  if (vercelEnv.toLowerCase() === "production") {
    return "Refusing to seed Scout tickets in production.";
  }

  const url = env.DATABASE_URL?.trim() ?? "";
  if (!url) return "DATABASE_URL is not set.";

  const prodUrl = env.PROD_DATABASE_URL?.trim();
  if (prodUrl && sameDatabase(url, prodUrl)) {
    return "Refusing to seed Scout tickets against the production database.";
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "DATABASE_URL is not a valid URL.";
  }

  const host = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "").toLowerCase();
  if (looksLikeProductionName(host) || looksLikeProductionName(database)) {
    return "Refusing to seed Scout tickets against a production database.";
  }

  const localOnly = surface === "script" || (surface === "admin" && !vercelEnv && !scoutSampleTicketsOptIn(env));
  if (localOnly && !isLocalHost(host)) {
    return "Refusing to seed Scout tickets against a hosted database. Use the local dev database.";
  }

  return null;
}
