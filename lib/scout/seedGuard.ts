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

type ProductionDatabaseIssue = "vercel" | "missing" | "same" | "invalid" | "name";

/**
 * Production signals shared by the sample-ticket seed and `pnpm scout:review`.
 * VERCEL_ENV=production, the same host and database as PROD_DATABASE_URL,
 * and hosts or database names that contain prod. Credentials are not returned.
 */
function productionDatabaseIssue(env: ScoutSeedEnv): ProductionDatabaseIssue | null {
  const vercelEnv = env.VERCEL_ENV?.trim() ?? "";
  if (vercelEnv.toLowerCase() === "production") return "vercel";

  const url = env.DATABASE_URL?.trim() ?? "";
  if (!url) return "missing";

  const prodUrl = env.PROD_DATABASE_URL?.trim();
  if (prodUrl && sameDatabase(url, prodUrl)) return "same";

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid";
  }

  const host = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "").toLowerCase();
  if (looksLikeProductionName(host) || looksLikeProductionName(database)) return "name";
  return null;
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
  const production = productionDatabaseIssue(env);
  if (production === "vercel") return "Refusing to seed Scout tickets in production.";
  if (production === "missing") return "DATABASE_URL is not set.";
  if (production === "same") return "Refusing to seed Scout tickets against the production database.";
  if (production === "invalid") return "DATABASE_URL is not a valid URL.";
  if (production === "name") return "Refusing to seed Scout tickets against a production database.";

  const url = env.DATABASE_URL?.trim() ?? "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "DATABASE_URL is not a valid URL.";
  }
  const host = parsed.hostname.toLowerCase();
  const vercelEnv = env.VERCEL_ENV?.trim() ?? "";
  const localOnly = surface === "script" || (surface === "admin" && !vercelEnv && !scoutSampleTicketsOptIn(env));
  if (localOnly && !isLocalHost(host)) {
    return "Refusing to seed Scout tickets against a hosted database. Use the local dev database.";
  }

  return null;
}

/**
 * `pnpm scout:review` may read a local or staging database.
 * It must not open a production database. Hosted staging is allowed.
 * The message never includes the URL.
 */
export function scoutReviewDatabaseBlockReason(env: ScoutSeedEnv): string | null {
  switch (productionDatabaseIssue(env)) {
    case "vercel":
      return "Refusing to review Scout tickets in production.";
    case "missing":
      return "DATABASE_URL is not set. This dry-run only reads Scout tickets.";
    case "same":
    case "name":
      return "Refusing to review Scout tickets against the production database.";
    case "invalid":
      return "DATABASE_URL is not a valid URL.";
    default:
      return null;
  }
}
