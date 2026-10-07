/** Shown when Scout's tables or generated Prisma delegates are missing. */
export const SCOUT_STORAGE_NOT_READY = "Scout storage is not ready yet.";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Runtime exceptions that must not be copied into the tickets UI. */
const RAW_JS =
  /cannot read propert|is not a function|is not iterable|is not a constructor|is not defined|undefined is not|null is not|unexpected token|^typeerror\b|^referenceerror\b|^syntaxerror\b|^rangeerror\b/i;

const MISSING_DELEGATE =
  /cannot read properties of undefined \(reading ['"](?:upsert|findMany|findUnique|findFirst|create|update|updateMany|delete|deleteMany|count|aggregate|groupBy)['"]\)/i;

function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") return err.message;
  return "";
}

function errorCode(err: unknown): string {
  if (!err || typeof err !== "object" || !("code" in err)) return "";
  const code = err.code;
  return typeof code === "string" ? code : "";
}

/**
 * Stale generated client (delegate is undefined) or Scout tables/columns
 * that have not been migrated yet.
 */
export function isScoutStorageNotReadyError(err: unknown): boolean {
  const code = errorCode(err);
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const message = errorText(err);
  if (MISSING_DELEGATE.test(message)) return true;
  if (/does not exist/i.test(message) && /(table|relation|column|scout)/i.test(message)) return true;
  if (/invalid `prisma\./i.test(message) && /scout/i.test(message)) return true;
  return false;
}

/** Safe text for a thrown sync error. Never returns a raw JavaScript exception. */
export function scoutPublicErrorMessage(err: unknown, fallback = "Scout sync failed"): string {
  if (isScoutStorageNotReadyError(err)) return SCOUT_STORAGE_NOT_READY;
  const cleaned = errorText(err).replace(EMAIL, "[email]").replace(/\s+/g, " ").trim();
  if (!cleaned || RAW_JS.test(cleaned)) return fallback;
  return cleaned.slice(0, 300);
}

/** Safe text for a message that is about to be rendered. */
export function scoutUiText(message: string | null | undefined, fallback = "Scout sync failed"): string | null {
  if (message == null) return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  if (trimmed === SCOUT_STORAGE_NOT_READY) return trimmed;
  return scoutPublicErrorMessage(trimmed, fallback);
}
