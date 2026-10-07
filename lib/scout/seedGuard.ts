export type ScoutSeedEnv = {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
  PROD_DATABASE_URL?: string;
};

function urlsEqual(left: string, right: string): boolean {
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return left === right;
  }
}

function looksLikeProductionName(value: string): boolean {
  return /(^|[._-])prod(uction)?([._-]|$)/i.test(value);
}

/**
 * Synthetic Scout tickets are for local dev and staging only.
 * Production (VERCEL_ENV=production), a URL equal to PROD_DATABASE_URL, and
 * hosts or database names that contain prod are refused.
 * The laptop script also refuses hosted Prisma URLs.
 */
export function scoutSyntheticSeedBlockReason(
  env: ScoutSeedEnv,
  surface: "script" | "admin" = "admin",
): string | null {
  if (env.VERCEL_ENV === "production") {
    return "Refusing to seed Scout tickets in production.";
  }

  const url = env.DATABASE_URL?.trim() ?? "";
  if (!url) return "DATABASE_URL is not set.";

  const prodUrl = env.PROD_DATABASE_URL?.trim();
  if (prodUrl && urlsEqual(url, prodUrl)) {
    return "Refusing to seed Scout tickets against the production database.";
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "DATABASE_URL is not a valid URL.";
  }

  const host = parsed.hostname.toLowerCase();
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] ?? "").toLowerCase();
  if (looksLikeProductionName(host) || looksLikeProductionName(database)) {
    return "Refusing to seed Scout tickets against a production database.";
  }

  if (surface === "script" && /db\.prisma\.io|prisma-data\.net/i.test(host)) {
    return "Refusing to seed Scout tickets against a hosted database. Use the local dev database.";
  }

  return null;
}
