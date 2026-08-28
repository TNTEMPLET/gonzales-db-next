/** Map Prisma/driver errors to a short message for JSON API responses. */
export function routeErrorMessage(err: unknown, fallback = "Request failed"): string {
  const message = err instanceof Error ? err.message.trim() : String(err);
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
  const combined = `${message} ${cause}`.toLowerCase();
  if (
    message === "fetch failed" ||
    combined.includes("econnreset") ||
    combined.includes("connection terminated") ||
    combined.includes("connection closed")
  ) {
    return "Database connection was lost. Wait a moment and try again.";
  }
  return message || fallback;
}
