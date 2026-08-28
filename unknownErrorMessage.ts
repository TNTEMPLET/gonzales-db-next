/** Best-effort string for logging / JSON API errors when catch value is not an Error. */
export function unknownErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    if (typeof rec.message === "string") return rec.message;
    if (typeof rec.code === "string" || typeof rec.code === "number") {
      return String(rec.code);
    }
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}
